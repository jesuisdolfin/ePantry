import type { Unit } from "../state/inventory";
export type SimpleIng = { name: string; qty: number; unit: Unit };

const OPTIONAL = ["garnish", "optional", "to taste", "pinch", "sprig", "drizzle", "freshly", "for serving", "for decoration", "for dusting"];
const CORE = ["chicken","beef","pork","tofu","egg","fish","shrimp","pasta","noodle","rice","bread","tortilla","tomato","onion","garlic","potato","bean","cheese","milk","cream","broth","stock","sauce"];
const SPICES = ["salt","pepper","chili","paprika","cumin","oregano","basil","thyme","rosemary","coriander","curry","turmeric","cinnamon","nutmeg","clove","ginger","garam masala"];

const lc = (s:string) => s.toLowerCase();
const includesAny = (s:string, arr:string[]) => arr.some(w => lc(s).includes(w));

export function simplifyIngredients(
  ings: SimpleIng[],
  pantryNames: string[] = [],
  opts?: { maxItems?: number; minQty?: number }
): SimpleIng[] {
  const maxItems = opts?.maxItems ?? 7;
  const minQty = opts?.minQty ?? 0.25;
  const pantrySet = new Set(pantryNames.map(lc));

  // drop obvious optional/garnish
  let out = ings.filter(i => !includesAny(i.name, OPTIONAL));

  // drop tiny amounts unless core or already in pantry
  out = out.filter(i => i.qty >= minQty || pantrySet.has(lc(i.name)) || includesAny(i.name, CORE));

  // rank pantry-first, then core, then bigger qty
  const score = (i: SimpleIng) => (pantrySet.has(lc(i.name)) ? 20 : 0) + (includesAny(i.name, CORE) ? 10 : 0) + (i.qty >= 1 ? 1 : 0);
  out.sort((a,b) => score(b) - score(a));

  // cap to maxItems but keep at least some cores if present
  const cores = out.filter(i => includesAny(i.name, CORE)).slice(0,3);
  const rest = out.filter(i => !cores.includes(i)).slice(0, Math.max(0, maxItems - cores.length));
  const simplified = [...cores, ...rest];

  // stable-ish sort: pantry-first then alpha
  simplified.sort((a,b) => {
    const ap = pantrySet.has(lc(a.name)) ? 1 : 0;
    const bp = pantrySet.has(lc(b.name)) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return a.name.localeCompare(b.name);
  });

  return simplified;
}
