import PlansService from "./service";

export default class PlansController {
  static async getPlans() {
    try {
      const plans = await PlansService.getPlans();
      return plans;
    } catch (error) {
      console.error("Error fetching plans:", error);
      throw new Error("Failed to fetch plans.");
    }
  }
}