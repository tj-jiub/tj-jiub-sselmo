import { redirect } from "react-router";

// The plain space list was replaced by the founder matching flow.
export function loader() {
  return redirect("/find", 301);
}
