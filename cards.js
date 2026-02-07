export const CARDS = {
  profession: ["Doctor", "Engineer", "Chef", "Soldier", "Teacher", "Hacker", "Pilot", "Farmer"],
  health: ["Asthma", "Perfect health", "Diabetes", "Bad eyesight", "Strong immunity", "Heart issue"],
  hobby: ["Guitar", "Chess", "Hunting", "Cooking", "Coding", "Drawing", "Sports"],
  baggage: ["First aid kit", "Water filter", "Seeds", "Laptop", "Tools", "Generator", "Medicine box"],
  phobia: ["Heights", "Darkness", "Crowds", "Spiders", "Claustrophobia", "Fire"]
};

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
