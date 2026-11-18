const fs = require('fs');
const p = 'mobile/src/screens/CheckedInScreen.js';
let s = fs.readFileSync(p, 'utf8');

const oldCard = `                const isSharedRowItem = item.sharedRow === true || isSharedRowAssignment;
                return (
                  <View
                    key={\`\${item.workerID}-\${item.rowNumber}-\${index}\`}
                    className={
                      isSharedRowItem
                        ? "rounded-2xl border border-teal-200 bg-teal-50/40 p-3.5"
                        : "rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5"
                    }`;
const newCard = `                const isSharedRowItem = item.sharedRow === true || isSharedRowAssignment;
                return (
                  <View
                    key={\`\${item.workerID}-\${item.rowNumber}-\${index}\`}
                    className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5"`;
if (!s.includes(oldCard)) throw new Error('oldCard');
s = s.replace(oldCard, newCard);

const badge = `
                    {isSharedRowItem ? (
                      <View className="self-start mt-2 rounded-full bg-teal-100 px-2.5 py-1">
                        <Text className="text-teal-700 text-[11px] font-extrabold uppercase">
                          {t("ci.sharedRowBadge")}
                        </Text>
                      </View>
                    ) : null}`;
if (!s.includes(badge)) throw new Error('badge');
s = s.replace(badge, '');

const expandedNotice = `
                            {isSharedRow(expandedRecord) ? (
                              <View className="bg-teal-50 border border-teal-200 rounded-xl p-3 gap-1.5">
                                <Text className="text-teal-800 text-xs font-extrabold">
                                  {t("ci.sharedRowCheckoutNotice", {
                                    count: visibleDayWorkRecords.filter(
                                      (r) =>
                                        r.blockName === expandedRecord.blockName &&
                                        r.rowNumber === expandedRecord.rowNumber
                                    ).length,
                                  })}
                                </Text>
                                <Text className="text-teal-700 text-xs">
                                  {t("ci.sharedRowCheckoutHint")}
                                </Text>
                              </View>
                            ) : null}`;
if (!s.includes(expandedNotice)) throw new Error('expandedNotice');
s = s.replace(expandedNotice, '');

const modalNotice = `
                      {isSharedRow(w) ? (
                        <View className="bg-teal-50 border border-teal-200 rounded-xl p-3 gap-1.5">
                          <Text className="text-teal-800 text-xs font-extrabold">
                            {t("ci.sharedRowCheckoutNotice", {
                              count: visibleDayWorkRecords.filter(
                                (candidate) =>
                                  candidate.blockName === w.blockName &&
                                  candidate.rowNumber === w.rowNumber
                              ).length,
                            })}
                          </Text>
                          <Text className="text-teal-700 text-xs">
                            {t("ci.sharedRowCheckoutHint")}
                          </Text>
                        </View>
                      ) : `;
if (!s.includes(modalNotice)) throw new Error('modalNotice');
s = s.replace(modalNotice, '\n                      ');

const actionsHeader = `      <SectionCard
        title={t("ci.actions")}
        subtitle={t("ci.actionsSub")}
      >
        <View className="flex-row gap-2.5">`;
const actionsHeaderNew = `      <SectionCard
        title={t("ci.actions")}
        subtitle={t("ci.actionsSub")}
      >
        {availableWorkingJobs.length > 0 ? (
          <View style={{ gap: 8 }}>
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
        <View className="flex-row gap-2.5" style={{ marginTop: availableWorkingJobs.length ? 4 : 0 }}>`;
if (!s.includes(actionsHeader)) throw new Error('actionsHeader');
s = s.replace(actionsHeader, actionsHeaderNew);

fs.writeFileSync(p, s);
console.log('patched working ui');
