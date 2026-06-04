import { NextResponse } from "next/server";
import PlansController from "./controller";

export async function GET() {
  try {
    const plans = await PlansController.getPlans();
    if (!plans) {
      return NextResponse.json({ error: "No plans found." }, { status: 404 });
    }
    return NextResponse.json(plans, { status: 200 });
  } catch (error) {
    console.error("Error fetching plans:", error);
    return NextResponse.json({ error: "Failed to load plans." }, { status: 500 });
  }
}
