export const ASPECT_CONFIG: Record<string, { label: string; badge: string; dot: string }> = {
  Aggression: {
    label: "Aggression",
    badge: "bg-red-950/70 text-red-300 border-red-800/80 shadow-red-950/40",
    dot: "bg-red-500",
  },
  Command: {
    label: "Command",
    badge: "bg-emerald-950/70 text-emerald-300 border-emerald-800/80 shadow-emerald-950/40",
    dot: "bg-emerald-500",
  },
  Cunning: {
    label: "Cunning",
    badge: "bg-amber-950/70 text-amber-300 border-amber-800/80 shadow-amber-950/40",
    dot: "bg-amber-400",
  },
  Vigilance: {
    label: "Vigilance",
    badge: "bg-blue-950/70 text-blue-300 border-blue-800/80 shadow-blue-950/40",
    dot: "bg-blue-400",
  },
  Heroism: {
    label: "Heroism",
    badge: "bg-slate-800/90 text-slate-100 border-slate-600 shadow-slate-900/50",
    dot: "bg-slate-200",
  },
  Villainy: {
    label: "Villainy",
    badge: "bg-purple-950/70 text-purple-200 border-purple-800/80 shadow-purple-950/40",
    dot: "bg-purple-400",
  },
};

export const SET_CONFIG: Record<string, { label: string; dateLegal: string, dateRotatedOut: string, badge: string; dot: string }> = {
  "SOR": {
    "label": "Spark of Rebellion",
    "dateLegal": "2024-03-08",
    "dateRotatedOut": "2026-03-13",
    "badge": "bg-orange-950/70 text-orange-300 border-orange-800/80 shadow-orange-950/40",
    "dot": "bg-orange-500"
  },
  "SHD": {
    "label": "Shadows of the Galaxy",
    "dateLegal": "2024-07-12",
    "dateRotatedOut": "2026-03-13",
    "badge": "bg-purple-950/70 text-purple-300 border-purple-800/80 shadow-purple-950/40",
    "dot": "bg-purple-500"
  },
  "TWI": {
    "label": "Twilight of the Republic",
    "dateLegal": "2024-11-08",
    "dateRotatedOut": "2026-03-13",
    "badge": "bg-cyan-950/70 text-cyan-300 border-cyan-800/80 shadow-cyan-950/40",
    "dot": "bg-cyan-500"
  },
  "JTL": {
    "label": "Jump to Lightspeed",
    "dateLegal": "2025-03-14",
    "dateRotatedOut": "",
    "badge": "bg-sky-950/70 text-sky-300 border-sky-800/80 shadow-sky-950/40",
    "dot": "bg-sky-500"
  },
  "LOF": {
    "label": "Legends of the Force",
    "dateLegal": "2025-07-11",
    "dateRotatedOut": "",
    "badge": "bg-emerald-950/70 text-emerald-300 border-emerald-800/80 shadow-emerald-950/40",
    "dot": "bg-emerald-500"
  },
  "IBH": {
    "label": "Intro Battle: Hoth",
    "dateLegal": "2025-10-03",
    "dateRotatedOut": "",
    "badge": "bg-slate-900/70 text-slate-300 border-slate-700/80 shadow-slate-950/40",
    "dot": "bg-slate-400"
  },
  "SEC": {
    "label": "Secrets of Power",
    "dateLegal": "2025-11-07",
    "dateRotatedOut": "",
    "badge": "bg-indigo-950/70 text-indigo-300 border-indigo-800/80 shadow-indigo-950/40",
    "dot": "bg-indigo-500"
  },
  "LAW": {
    "label": "A Lawless Time",
    "dateLegal": "2026-03-13",
    "dateRotatedOut": "",
    "badge": "bg-red-950/70 text-red-300 border-red-800/80 shadow-red-950/40",
    "dot": "bg-red-500"
  },
  "ASH": {
    "label": "Ashes of the Empire",
    "dateLegal": "2026-07-17",
    "dateRotatedOut": "",
    "badge": "bg-amber-950/70 text-amber-300 border-amber-800/80 shadow-amber-950/40",
    "dot": "bg-amber-500"
  },
  "HMW": {
    "label": "Homeworlds",
    "dateLegal": "2026-10-09",
    "dateRotatedOut": "",
    "badge": "bg-teal-950/70 text-teal-300 border-teal-800/80 shadow-teal-950/40",
    "dot": "bg-teal-500"
  },
  "IC27": {
    "label": "Icons 2027 Edition",
    "dateLegal": "2026-11-20",
    "dateRotatedOut": "",
    "badge": "bg-yellow-950/70 text-yellow-300 border-yellow-800/80 shadow-yellow-950/40",
    "dot": "bg-yellow-500"
  }
};


interface BanEntry {
  card_name: string;
  set: string;
  card_number: string;
  ban_date: string;
  unban_date: string | null;
  status: string;
}

export const PREMIER_BAN_LIST: Record<string, BanEntry> = {
    "SOR_015": {
      "card_name": "Boba Fett, Collecting the Bounty",
      "set": "Spark of Rebellion",
      "card_number": "015",
      "ban_date": "2024-11-08",
      "unban_date": null,
      "status": "Rotated out of Premier / Legal in Eternal"
    },
    "TWI_016": {
      "card_name": "Jango Fett, Concealing the Conspiracy",
      "set": "Twilight of the Republic",
      "card_number": "016",
      "ban_date": "2025-04-09",
      "unban_date": null,
      "status": "Rotated out of Premier / Legal in Eternal"
    },
    "SHD_194": {
      "card_name": "Triple Dark Raid",
      "set": "Shadows of the Galaxy",
      "card_number": "194",
      "ban_date": "2025-04-09",
      "unban_date": null,
      "status": "Rotated out of Premier / Legal in Eternal"
    },
    "SHD_213": {
      "card_name": "DJ, Blatant Thief",
      "set": "Shadows of the Galaxy",
      "card_number": "213",
      "ban_date": "2025-04-09",
      "unban_date": null,
      "status": "Rotated out of Premier / Legal in Eternal"
    },
    "SOR_167": {
      "card_name": "Force Throw",
      "set": "Spark of Rebellion",
      "card_number": "167",
      "ban_date": "2025-09-22",
      "unban_date": null,
      "status": "Rotated out of Premier / Legal in Eternal"
    },
    "ASH_018": {
      "card_name": "Cad Bane, Still Faster than You",
      "set": "Ashes of the Empire",
      "card_number": "018",
      "ban_date": "2026-08-31",
      "unban_date": null,
      "status": "Suspended"
    },
    "ASH_052": {
      "card_name": "Chimaera, A Frightening Reality",
      "set": "Ashes of the Empire",
      "card_number": "052",
      "ban_date": "2026-11-09",
      "unban_date": null,
      "status": "Suspended"
    },
    "ASH_079": {
      "card_name": "Koska Reeves, Warrior of Mandalore",
      "set": "Ashes of the Empire",
      "card_number": "079",
      "ban_date": "2026-11-09",
      "unban_date": null,
      "status": "Suspended"
    },
    "ASH_248": {
      "card_name": "Neel, The Cutest Boy",
      "set": "Ashes of the Empire",
      "card_number": "248",
      "ban_date": "2026-11-09",
      "unban_date": null,
      "status": "Suspended"
    },
    "SEC_179": {
      "card_name": "Aggressive Negotiations",
      "set": "Secrets of Power",
      "card_number": "179",
      "ban_date": "2026-11-09",
      "unban_date": null,
      "status": "Suspended"
    }
}

export const ETERNAL_BAN_LIST: Record<string, BanEntry> = {
    "JTL_170": {
        "card_name": "War Juggernaut",
        "set": "Jump to Lightspeed",
        "card_number": "170",
        "ban_date": "2026-04-24",
        "unban_date": "2026-10-09",
        "status": "Unsuspended (Homeworlds release)"
    },
    "JTL_140": {
        "card_name": "IG-2000, Assassin's Aggressor",
        "set": "Jump to Lightspeed",
        "card_number": "140",
        "ban_date": "2026-04-24",
        "unban_date": "2026-10-09",
        "status": "Unsuspended (Homeworlds release)"
    },
     "JTL_024": {
        "card_name": "Data Vault",
        "set": "Jump to Lightspeed",
        "card_number": "24",
        "ban_date": "2026-11-23",
        "unban_date": null,
        "status": "Suspended"
    }
}