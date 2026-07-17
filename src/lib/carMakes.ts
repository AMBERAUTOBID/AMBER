export const CAR_MAKES = [
  "Acura",
  "Alfa Romeo",
  "Aston Martin",
  "Audi",
  "Bentley",
  "BMW",
  "Cadillac",
  "Chevrolet",
  "Chrysler",
  "Dodge",
  "Ferrari",
  "Fiat",
  "Ford",
  "GMC",
  "Honda",
  "Hyundai",
  "Infiniti",
  "Jaguar",
  "Jeep",
  "Kia",
  "Lamborghini",
  "Land Rover",
  "Lexus",
  "Maserati",
  "Mazda",
  "McLaren",
  "Mercedes-Benz",
  "Mini",
  "Mitsubishi",
  "Nissan",
  "Porsche",
  "Ram",
  "Rolls-Royce",
  "Subaru",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo",
] as const;

/**
 * Short monogram badge for a make. Not brand logo artwork (we don't have
 * licensed rights to reproduce official trademarks) — just a clean initials
 * badge for visual scanning, similar to a generated avatar.
 */
export function getMakeMonogram(make: string): string {
  const words = make.split(/[\s-]+/).filter(Boolean);

  if (words.length >= 2) {
    return words
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 3);
  }

  const word = words[0] ?? make;
  if (word.length <= 4 && word === word.toUpperCase()) {
    return word;
  }
  return word.slice(0, 2).toUpperCase();
}
