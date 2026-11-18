import { Text, View } from "react-native";
import { s } from "./reference";
import { titleCase } from "../utils/format";
export function SessionRecipes({ menu }) {
  if (!menu) return <Text style={s.muted}>Recipes will appear after the menu is confirmed.</Text>;
  return <View style={{ gap: 18 }}>
    {menu.food_notes?.instructions ? <Text style={s.subtitle}>Food notes: {menu.food_notes.instructions}</Text> : null}
    {menu.food_notes?.allergens?.length ? <Text style={s.error}>Allergens: {menu.food_notes.allergens.join(", ")}</Text> : null}
    {menu.food_notes?.other_restrictions ? <Text style={s.subtitle}>{menu.food_notes.other_restrictions}</Text> : null}
    {Object.entries(menu.recipes || {}).map(([meal, recipe]) => <View key={meal} style={[s.card, { gap: 9 }]}>
      <Text style={s.small}>{titleCase(meal)} · {recipe.servings} servings · {recipe.cooking_minutes} min</Text>
      <Text style={s.subtitle}>{recipe.title}</Text>
      <Text style={s.subtitle}>Ingredients</Text>
      {(recipe.ingredients || []).map((i, n) => <Text key={n} style={s.muted}>{typeof i === "string" ? i : `${i.quantity} ${i.unit} ${i.name}`}</Text>)}
      <Text style={s.subtitle}>Method</Text>
      {(recipe.steps || []).map((step, n) => <Text key={n} style={s.muted}>{n + 1}. {step}</Text>)}
      {recipe.storage_notes ? <Text style={s.small}>{recipe.storage_notes}</Text> : null}
    </View>)}
  </View>;
}
