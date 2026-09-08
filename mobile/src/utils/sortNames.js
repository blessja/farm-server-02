export function sortNamesNumerically(names = []) {
  const extractNumber = (value) => {
    const match = String(value).match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };

  return [...names].sort((a, b) => {
    const numA = extractNumber(a);
    const numB = extractNumber(b);

    if (numA != null && numB != null) {
      if (numA !== numB) return numA - numB;
    } else if (numA != null) {
      return -1;
    } else if (numB != null) {
      return 1;
    }

    return String(a).localeCompare(String(b));
  });
}