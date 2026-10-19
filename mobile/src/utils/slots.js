// Customer labels match the existing Chefos service windows. Booking payloads
// retain stable wave identifiers so capacity is checked consistently on server.
const labels = {
  B1: "6:00–7:20 AM",
  B2: "7:30–8:50 AM",
  B3: "9:00–10:20 AM",
  B4: "10:30–11:30 AM",
  B5: "11:30 AM–12:30 PM",
  L1: "12:00–1:20 PM",
  L2: "1:30–2:50 PM",
  L3: "3:00–4:20 PM",
  L4: "4:30–5:30 PM",
  L5: "5:30–6:30 PM",
  D1: "6:30–7:50 PM",
  D2: "8:00–9:20 PM",
  D3: "9:30–10:50 PM",
  D4: "11:00–11:59 PM",
  D5: "12:00–1:00 AM",
};
export const slotLabel = (wave) => labels[wave] || wave;
