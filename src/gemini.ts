type GeminiAttemptResult = {
	text: string;
	errorText: string;
};

export function generateHexId(bytes: number): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

type OtlpAnyValue =
	| { stringValue: string }
	| { intValue: string | number }
	| { boolValue: boolean };

function toOtlpAttribute(key: string, value: unknown): { key: string; value: OtlpAnyValue } | null {
	if (value === undefined || value === null) return null;
	if (typeof value === "boolean") {
		return { key, value: { boolValue: value } };
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return Number.isInteger(value)
			? { key, value: { intValue: String(value) } }
			: { key, value: { stringValue: String(value) } };
	}
	const str = typeof value === "string" ? value : JSON.stringify(value);
	return { key, value: { stringValue: str } };
}

function isoToUnixNanoString(iso: string): string {
	const ms = Date.parse(iso);
	const safeMs = Number.isFinite(ms) ? ms : Date.now();
	return (BigInt(safeMs) * 1_000_000n).toString();
}

async function sendLangfuseGeneration(
	env: {
		LANGFUSE_PUBLIC_KEY?: string;
		LANGFUSE_SECRET_KEY?: string;
		LANGFUSE_BASE_URL?: string;
	},
	payload: {
		traceId: string; // 32-char hex string (16 bytes)
		name: string;
		model: string;
		input: unknown;
		output: unknown;
		startTime: string;
		endTime: string;
		level?: "DEFAULT" | "WARNING" | "ERROR";
		statusMessage?: string;
		usage?: { input?: number; output?: number };
		metadata?: Record<string, unknown>;
	},
): Promise<void> {
	if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) return;

	const baseUrl = (env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com").replace(/\/+$/, "");
	const auth = btoa(`${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`);
	const spanId = generateHexId(8);

	const rawAttributes: Array<{ key: string; value: OtlpAnyValue } | null> = [
		toOtlpAttribute("langfuse.trace.name", payload.name),
		toOtlpAttribute("langfuse.observation.type", "generation"),
		toOtlpAttribute("gen_ai.request.model", payload.model),
		toOtlpAttribute("langfuse.observation.input", payload.input),
		toOtlpAttribute("langfuse.observation.output", payload.output),
		toOtlpAttribute("gen_ai.usage.input_tokens", payload.usage?.input),
		toOtlpAttribute("gen_ai.usage.output_tokens", payload.usage?.output),
		toOtlpAttribute("langfuse.observation.level", payload.level ?? "DEFAULT"),
	];

	if (payload.statusMessage) {
		rawAttributes.push(toOtlpAttribute("langfuse.observation.status_message", payload.statusMessage));
	}

	if (payload.metadata) {
		for (const [k, v] of Object.entries(payload.metadata)) {
			rawAttributes.push(toOtlpAttribute(`langfuse.trace.metadata.${k}`, v));
		}
	}

	const attributes = rawAttributes.filter(
		(attr): attr is { key: string; value: OtlpAnyValue } => attr !== null,
	);

	const otlpBody = {
		resourceSpans: [
			{
				resource: {
					attributes: [
						{ key: "service.name", value: { stringValue: "murderofporgs-worker" } },
					],
				},
				scopeSpans: [
					{
						scope: { name: "coach-worker-tracer", version: "1.0.0" },
						spans: [
							{
								traceId: payload.traceId,
								spanId,
								name: payload.name,
								kind: 3, // SPAN_KIND_CLIENT
								startTimeUnixNano: isoToUnixNanoString(payload.startTime),
								endTimeUnixNano: isoToUnixNanoString(payload.endTime),
								attributes,
								status:
									payload.level === "ERROR"
										? { code: 2, message: payload.statusMessage || "Error" }
										: { code: 1 },
							},
						],
					},
				],
			},
		],
	};

	const res = await fetch(`${baseUrl}/api/public/otel/v1/traces`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Basic ${auth}`,
			"x-langfuse-ingestion-version": "4",
		},
		body: JSON.stringify(otlpBody),
	});

	if (!res.ok) {
		const errBody = await res.text().catch(() => "");
		console.warn(`Langfuse OTLP ingest failed (${res.status}): ${errBody}`);
	}
}

export async function callGeminiWithTrace(opts: {
	c: any; // Hono context with env & executionCtx
	traceId: string;
	name: string;
	model: string;
	prompt: string;
	apiKey: string;
	mode: "interactions" | "generateContent";
	timeoutMs?: number;
}): Promise<GeminiAttemptResult> {
	const { c, traceId, name, model, prompt, apiKey, mode, timeoutMs = 10000 } = opts;
	const startTime = new Date().toISOString();

	let text = "";
	let errorText = "";
	let level: "DEFAULT" | "WARNING" | "ERROR" = "DEFAULT";
	let statusMessage: string | undefined;
	let usage: { input?: number; output?: number } | undefined;
	let rawOutput: unknown = null;

	try {
		if (mode === "interactions") {
			const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": apiKey,
				},
				signal: AbortSignal.timeout(timeoutMs),
				body: JSON.stringify({ model, input: prompt }),
			});

			if (res.ok) {
				const data = (await res.json()) as any;
				rawOutput = data;
				const step = data.steps?.find((s: any) => s.type === "model_output");
				const textPart = step?.content?.find((c: any) => c.type === "text" || typeof c.text === "string");
				if (textPart?.text) text = textPart.text;
				usage = {
					input: data.usage?.inputTokens ?? data.usageMetadata?.promptTokenCount,
					output: data.usage?.outputTokens ?? data.usageMetadata?.candidatesTokenCount,
				};
			} else {
				errorText = await res.text();
				level = "ERROR";
				statusMessage = `HTTP ${res.status}: ${errorText}`;
				rawOutput = errorText;
			}
		} else {
			const geminiUrl = apiKey.startsWith("AQ.")
				? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
				: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

			const res = await fetch(geminiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": apiKey,
				},
				signal: AbortSignal.timeout(timeoutMs),
				body: JSON.stringify({
					contents: [{ role: "user", parts: [{ text: prompt }] }],
					generationConfig: {
						temperature: 0.3,
						responseMimeType: "application/json",
					},
				}),
			});

			if (res.ok) {
				const data = (await res.json()) as any;
				rawOutput = data;
				const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
				if (candidateText) text = candidateText;
				usage = {
					input: data.usageMetadata?.promptTokenCount,
					output: data.usageMetadata?.candidatesTokenCount,
				};
			} else {
				errorText = await res.text();
				level = "ERROR";
				statusMessage = `HTTP ${res.status}: ${errorText}`;
				rawOutput = errorText;
			}
		}
	} catch (err: any) {
		errorText = err?.message || `Gemini ${mode} request failed`;
		level = "ERROR";
		statusMessage = errorText;
		rawOutput = errorText;
	}

	const endTime = new Date().toISOString();

	// Flush in background without blocking the API response
	c.executionCtx.waitUntil(
		sendLangfuseGeneration(c.env, {
			traceId,
			name,
			model,
			input: prompt,
			output: text || rawOutput,
			startTime,
			endTime,
			level,
			statusMessage,
			usage,
			metadata: { mode, leader: c.req.raw ? undefined : undefined },
		}).catch((err) => console.error("Langfuse background task failed:", err))
	);

	return { text, errorText };
}