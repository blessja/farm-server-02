const fs = require('fs');
const p = 'mobile/src/screens/CheckedInScreen.js';
let s = fs.readFileSync(p, 'utf8');

// Add bunches row after vines row in detail cards (two occurrences)
const old = `                        <View className="flex-row items-center justify-between">
                          <Text className="text-gray-500 text-xs font-bold">{t("ci.vines")}</Text>
                          <Text className="text-gray-900 text-sm font-extrabold">{w.vines ?? "—"}</Text>
                        </View>`;
const rep = `                        <View className="flex-row items-center justify-between">
                          <Text className="text-gray-500 text-xs font-bold">{t("ci.vines")}</Text>
                          <Text className="text-gray-900 text-sm font-extrabold">{w.vines ?? "—"}</Text>
                        </View>
                        {String(w.job_type || "").toUpperCase() === "UITKNIP" ? (
                          <View className="flex-row items-center justify-between">
                            <Text className="text-gray-500 text-xs font-bold">Bunches</Text>
                            <Text className="text-gray-900 text-sm font-extrabold">{w.bunches ?? "—"}</Text>
                          </View>
                        ) : null}`;
if (s.split(old).length - 1 !== 2) {
  console.error('expected 2 vines blocks, found', s.split(old).length - 1);
  process.exit(1);
}
s = s.split(old).join(rep);

// Keep-choice prompt include bunches for UITKNIP
const oldPrompt = `                          <Text className="text-gray-600 text-xs font-bold">
                            {t("ci.partialPrompt", {
                              remaining: String(w.remainingStocks ?? ""),
                              name: w.workerName,
                            })}
                          </Text>`;
const repPrompt = `                          <Text className="text-gray-600 text-xs font-bold">
                            {String(w.job_type || "").toUpperCase() === "UITKNIP"
                              ? \`Partially done — \${String(w.remainingStocks ?? "")} vines / \${String(w.rowRemainingBunches ?? w.remainingBunches ?? 0)} bunches left. Keep \${w.workerName} checked in?\`
                              : t("ci.partialPrompt", {
                                  remaining: String(w.remainingStocks ?? ""),
                                  name: w.workerName,
                                })}
                          </Text>`;
if (!s.includes(oldPrompt)) { console.error('prompt not found'); process.exit(1); }
s = s.replace(oldPrompt, repPrompt);

const oldKeep = `                                {t("ci.keepChoice", { remaining: String(w.remainingStocks ?? "") })}`;
const repKeep = `                                {String(w.job_type || "").toUpperCase() === "UITKNIP"
                                  ? \`Keep checked in (\${String(w.remainingStocks ?? "")}v / \${String(w.rowRemainingBunches ?? w.remainingBunches ?? 0)}b left)\`
                                  : t("ci.keepChoice", { remaining: String(w.remainingStocks ?? "") })}`;
if (!s.includes(oldKeep)) { console.error('keep not found'); process.exit(1); }
s = s.replace(oldKeep, repKeep);

fs.writeFileSync(p, s);
console.log('patched checkedin');
