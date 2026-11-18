const fs = require('fs');
const p = 'mobile/src/screens/CheckedInScreen.js';
let s = fs.readFileSync(p, 'utf8');

const oldCard = `                    className={\`rounded-xl border p-3.5 \${
                      isSharedRowItem
                        ? "bg-teal-50 border-teal-300"
                        : isKeptCheckedIn(item)
                          ? "bg-emerald-50 border-emerald-300"
                          : "bg-gray-50 border-gray-100"
                    }\`}`;
const newCard = `                    className={\`rounded-xl border p-3.5 \${
                      isKeptCheckedIn(item)
                        ? "bg-emerald-50 border-emerald-300"
                        : "bg-gray-50 border-gray-100"
                    }\`}`;
if (!s.includes(oldCard)) throw new Error('oldCard');
s = s.replace(oldCard, newCard);

// remove shared badge block starting at line with {isSharedRowItem ? (
const badgeStart = `
                    {isSharedRowItem ? (`;
const badgeIdx = s.indexOf(badgeStart);
if (badgeIdx === -1) throw new Error('badgeStart');
// find matching end ": null}" of this conditional block by locating "t(\"ci.sharedRowBadge\")" area and next }) : null}
const after = s.indexOf('t("ci.sharedRowBadge")', badgeIdx);
if (after === -1) throw new Error('badgeText');
const end = s.indexOf(') : null}', after);
if (end === -1) throw new Error('badgeEnd');
s = s.slice(0, badgeIdx) + s.slice(end + ') : null}'.length);

// remove expanded shared notice
const expStart = `
                            {isSharedRow(expandedRecord) ? (`;
const expIdx = s.indexOf(expStart);
if (expIdx === -1) throw new Error('expStart');
const hint = s.indexOf('t("ci.sharedRowCheckoutHint")', expIdx);
if (hint === -1) throw new Error('expHint');
const expEnd = s.indexOf(') : null}', hint);
if (expEnd === -1) throw new Error('expEnd');
s = s.slice(0, expIdx) + s.slice(expEnd + ') : null}'.length);

// remove modal shared notice (ternary -> else branch follows) and simplify condition chain
const modalStart = `
                      {isSharedRow(w) ? (`;
const modalIdx = s.indexOf(modalStart);
if (modalIdx === -1) throw new Error('modalStart');
const modalHint = s.indexOf('t("ci.sharedRowCheckoutHint")', modalIdx);
if (modalHint === -1) throw new Error('modalHint');
const modalEnd = s.indexOf(') : ', modalHint);
if (modalEnd === -1) throw new Error('modalEnd');
s = s.slice(0, modalIdx) + '\n                      ' + s.slice(modalEnd + ') : '.length);

// actions card job selector
const actions = `      <SectionCard
        title={t("ci.actions")}
        subtitle={t("ci.actionsSub")}
      >
        <View className="flex-row gap-2.5">`;
const actionsNew = `      <SectionCard
        title={t("ci.actions")}
        subtitle={t("ci.actionsSub")}
      >
        {availableWorkingJobs.length > 0 ? (
          <View style={{ gap: 8, marginBottom: 10 }}>
            <Text style={{ color: "#6b7280", fontSize: 12, fontWeight: "700" }}>Job (view separately)</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {availableWorkingJobs.map((job) => {
                const active = selectedWorkingJob === job;
                return (
                  <TouchableOpacity
                    key={job}
                    activeOpacity={0.7}
                    onPress={() => setSelectedWorkingJob(job)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? "#16a34a" : "#d1d5db",
                      backgroundColor: active ? "#dcfce7" : "#fff",
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: active ? "800" : "600", color: active ? "#15803d" : "#374151" }}>
                      {job}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}
        <View className="flex-row gap-2.5">`;
if (!s.includes(actions)) throw new Error('actions');
s = s.replace(actions, actionsNew);

fs.writeFileSync(p, s);
console.log('patched ui fix');
