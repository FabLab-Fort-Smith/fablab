import PlansModel from "./model";

export default class PlansService {
  static async getPlans() {
    try {
      const plans = await PlansModel.getPlans();
      return plans;
    } catch (error) {
      console.error("Error fetching plans:", error);
      throw new Error("Failed to fetch plans from Square.");
    }
  }
}