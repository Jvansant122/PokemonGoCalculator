import type { PokemonType } from "@pogo-analyzer/engine";

/**
 * The standard Pokémon-type color palette (the same set community tools like
 * Bulbapedia/Serebii/PvPoke use for type badges), keyed off this engine's
 * exact `PokemonType` string-literal union (types.ts) so this map can never
 * drift out of sync with a type the engine doesn't know about. Consumed by
 * MoveSelect.tsx to give every move-selection dropdown across every tab
 * (Comparator/Team Raid/Species Report/IV Breakpoints/Attack-Defense
 * Breakpoints) a visible type indicator, per the standing UI requirement that
 * a move's type be visible wherever it's picked — see MoveSelect.tsx's own
 * doc comment for why the swatch lives on the wrapping field rather than on
 * the native <option> elements themselves (cross-browser <option>
 * background-color styling is unreliable).
 */
export const TYPE_COLORS: Record<PokemonType, string> = {
  normal: "#A8A878",
  fire: "#F08030",
  water: "#6890F0",
  electric: "#F8D030",
  grass: "#78C850",
  ice: "#98D8D8",
  fighting: "#C03028",
  poison: "#A040A0",
  ground: "#E0C068",
  flying: "#A890F0",
  psychic: "#F85888",
  bug: "#A8B820",
  rock: "#B8A038",
  ghost: "#705898",
  dragon: "#7038F8",
  dark: "#705848",
  steel: "#B8B8D0",
  fairy: "#EE99AC",
};

/** "Fire" from "fire" — used both as the visible bracketed option-text tag and the swatch's accessible label. */
export function typeLabel(type: PokemonType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
