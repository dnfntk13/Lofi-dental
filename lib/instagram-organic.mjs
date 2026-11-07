/** Only dedicated, explicitly tagged links. A referral or fbclid is not proof of a paid ad or a post. */
export function instagramOrganicKind(value = {}) {
  if (value.source?.toLowerCase() !== "instagram" || value.medium?.toLowerCase() !== "organic_social") return null;
  const campaign = value.campaign ?? "";
  if (/^lofi_ig_organic_qa_\d{8}_\d{4}$/.test(campaign)) return "qa";
  if (/^lofi_ig_organic_(profile_\d{8}|\d{8}_\d{4}_[a-z0-9_]{1,48}_(feed_story|reel_story|story))$/.test(campaign)) return "organic";
  return null;
}

export function organicEventKind(event) {
  return instagramOrganicKind({ ...event.campaign, campaign: event.campaign?.name });
}

export function summarizeInstagramOrganic(events) {
  const rows = new Map();
  const checks = new Map();
  for (const event of events) {
    const kind = organicEventKind(event);
    if (!kind) continue;
    const campaign = event.campaign.name;
    const map = kind === "qa" ? checks : rows;
    const row = map.get(campaign) || { campaign, views: 0, visitors: new Set(), days: new Set(), lastReceivedAt: "" };
    row.views += 1;
    if (event.visitorId) row.visitors.add(event.visitorId);
    row.days.add(event.day);
    row.lastReceivedAt = [row.lastReceivedAt, event.timestamp || ""].sort().pop();
    map.set(campaign, row);
  }
  const serialize = map => [...map.values()].map(row => ({ ...row, visitors: row.visitors.size, days: [...row.days].sort() })).sort((a,b) => a.campaign.localeCompare(b.campaign));
  return { rows: serialize(rows), checks: serialize(checks) };
}
