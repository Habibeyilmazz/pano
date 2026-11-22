/**
 * Turkish-aware search folding: "İstanbul" -> "istanbul", "ILIK" -> "ilik", "Çay" -> "cay".
 * Dotted and dotless i fold together so people can search without Turkish keyboard letters.
 */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}
