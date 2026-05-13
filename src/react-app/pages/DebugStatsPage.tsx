import { useCallback, useEffect, useState } from "react";
import { Seo } from "../components/Seo";
import { SITE_NAME } from "../lib/site";

type Row = {
	slug: string;
	likes: number;
	views: number;
	updated_at: number;
};

function formatUpdated(ts: number) {
	if (!Number.isFinite(ts) || ts <= 0) {
		return "—";
	}
	return new Date(ts * 1000).toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

export function DebugStatsPage() {
	const [rows, setRows] = useState<Row[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setError(null);
		setRows(null);
		const r = await fetch("/api/debug/stats");
		if (!r.ok) {
			setError(`${r.status} ${r.statusText}`);
			return;
		}
		const data = (await r.json()) as { rows: Row[] };
		setRows(Array.isArray(data.rows) ? data.rows : []);
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	return (
		<>
			<Seo
				title="Debug stats"
				description={`Internal metrics dump for ${SITE_NAME}. Not linked in navigation.`}
				path="/debug/stats"
				noIndex
			/>
			<section className="content-card page-card debug-stats">
				<h2 className="page-title">Debug · post_metrics</h2>
				<p className="debug-stats__note">
					Data from D1 via{" "}
					<code>GET /api/debug/stats</code>.
				</p>
				<p className="debug-stats__actions">
					<button type="button" onClick={() => void load()}>
						Refresh
					</button>
				</p>
				{error ? (
					<p className="debug-stats__error" role="alert">
						{error}
					</p>
				) : null}
				{rows === null && !error ? (
					<p className="debug-stats__loading">Loading…</p>
				) : null}
				{rows && rows.length === 0 && !error ? (
					<p className="debug-stats__empty">No rows yet.</p>
				) : null}
				{rows && rows.length > 0 ? (
					<div className="debug-stats__table-wrap">
						<table className="debug-stats__table">
							<thead>
								<tr>
									<th scope="col">slug</th>
									<th scope="col" className="debug-stats__num">
										views
									</th>
									<th scope="col" className="debug-stats__num">
										likes
									</th>
									<th scope="col">updated_at</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((row) => (
									<tr key={row.slug}>
										<td>
											<code>{row.slug}</code>
										</td>
										<td className="debug-stats__num">{row.views}</td>
										<td className="debug-stats__num">{row.likes}</td>
										<td className="debug-stats__time">
											{formatUpdated(row.updated_at)}
											{" "}
											<span className="debug-stats__unix">
												({row.updated_at})
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : null}
			</section>
		</>
	);
}
