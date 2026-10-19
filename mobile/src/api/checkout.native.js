import { NativeModules, TurboModuleRegistry } from "react-native";
export async function openCheckout(order, email) {
  if (
    !NativeModules.RNRazorpayCheckout &&
    !TurboModuleRegistry.get("RNRazorpayCheckout")
  )
    throw new Error(
      "Payments are available in the installed Chefos app. Please use an Android or iOS development or release build.",
    );
  const RazorpayCheckout = require("react-native-razorpay").default;
  return RazorpayCheckout.open({
    key: order.key,
    order_id: order.order_id,
    amount: order.amount,
    currency: order.currency,
    name: "Chefos",
    description: order.description,
    prefill: { email },
    theme: { color: "#14213D" },
  });
}
