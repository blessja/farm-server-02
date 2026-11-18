const fs = require('fs');
const p = 'mobile/src/screens/CheckedInScreen.js';
let s = fs.readFileSync(p, 'utf8');

const oldKeep = `                                  <TouchableOpacity
                                    activeOpacity={0.7}
                                    style={{
                                      flex: 1,
                                      borderRadius: 12,
                                      paddingVertical: 10,
                                      alignItems: "center",
                                      backgroundColor: inlineCheckoutChoice === "keep" ? "#2D7A55" : "#E5ECE4",
                                      borderWidth: inlineCheckoutChoice === "keep" ? 0 : 1,
                                      borderColor: "#D4DFD3",
                                    }}
                                    onPress={() => setInlineCheckoutChoice("keep")}
                                  >`;
const newKeep = `                                  <TouchableOpacity
                                    activeOpacity={0.7}
                                    style={{
                                      flex: 1,
                                      borderRadius: 12,
                                      paddingVertical: 10,
                                      alignItems: "center",
                                      backgroundColor: inlineCheckoutChoice === "keep" ? "#2D7A55" : "#E5ECE4",
                                      borderWidth: inlineCheckoutChoice === "keep" ? 0 : 1,
                                      borderColor: "#D4DFD3",
                                      opacity: inlineCheckoutSubmitting ? 0.5 : 1,
                                    }}
                                    disabled={inlineCheckoutSubmitting}
                                    onPress={() => { setInlineCheckoutChoice("keep"); handleInlineCheckout("keep"); }}
                                  >`;
if (!s.includes(oldKeep)) throw new Error('oldKeep');
s = s.replace(oldKeep, newKeep);

const oldFree = `                                  <TouchableOpacity
                                    activeOpacity={0.7}
                                    style={{
                                      flex: 1,
                                      borderRadius: 12,
                                      paddingVertical: 10,
                                      alignItems: "center",
                                      backgroundColor: inlineCheckoutChoice === "free" ? "#b91c1c" : "#E5ECE4",
                                      borderWidth: inlineCheckoutChoice === "free" ? 0 : 1,
                                      borderColor: "#D4DFD3",
                                    }}
                                    onPress={() => setInlineCheckoutChoice("free")}
                                  >`;
const newFree = `                                  <TouchableOpacity
                                    activeOpacity={0.7}
                                    style={{
                                      flex: 1,
                                      borderRadius: 12,
                                      paddingVertical: 10,
                                      alignItems: "center",
                                      backgroundColor: inlineCheckoutChoice === "free" ? "#b91c1c" : "#E5ECE4",
                                      borderWidth: inlineCheckoutChoice === "free" ? 0 : 1,
                                      borderColor: "#D4DFD3",
                                      opacity: inlineCheckoutSubmitting ? 0.5 : 1,
                                    }}
                                    disabled={inlineCheckoutSubmitting}
                                    onPress={() => { setInlineCheckoutChoice("free"); handleInlineCheckout("free"); }}
                                  >`;
if (!s.includes(oldFree)) throw new Error('oldFree');
s = s.replace(oldFree, newFree);

const oldDisabled = `                            disabled={
                              activeOperation === "checkout" &&
                              (inlineCheckoutSubmitting ||
                                !canSubmitCheckout(inlineCheckoutWorkDate, inlineCheckoutReason))
                            }`;
const newDisabled = `                            disabled={
                              activeOperation === "checkout" &&
                              (inlineCheckoutSubmitting ||
                                !canSubmitCheckout(inlineCheckoutWorkDate, inlineCheckoutReason) ||
                                checkoutWillKeepWorker(expandedRecord, inlineCheckoutStock))
                            }`;
if (!s.includes(oldDisabled)) throw new Error('oldDisabled');
s = s.replace(oldDisabled, newDisabled);

fs.writeFileSync(p, s);
console.log('fixed inline checkout');
