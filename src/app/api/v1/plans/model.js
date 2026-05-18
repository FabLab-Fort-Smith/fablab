import { db } from "@/lib/database";
import fs from 'fs';
import path from 'path';

export default class PlansModel {
  static async getPlans() {
    try {
      const dbPlans = await db.dbPlans();

      // Load hidden Square plan IDs so we can filter them out
      const hiddenDoc = await dbPlans.findOne({ _id: "hidden_plans" });
      const hiddenIds = new Set(hiddenDoc?.ids || []);

      // ALWAYS prefer plans.json as the source of truth if it exists
      try {
        const plansPath = path.join(process.cwd(), 'plans.json');
        if (fs.existsSync(plansPath)) {
          const jsonPlans = JSON.parse(fs.readFileSync(plansPath, 'utf8'));
          if (jsonPlans?.length) {
            return jsonPlans.filter(p => !hiddenIds.has(p.id) && !hiddenIds.has(p.squarePlanId));
          }
        }
      } catch (err) {
        console.error("Failed to read plans.json", err);
      }

      // Fallback to DB if JSON fails
      const plans = await dbPlans.find({ _id: { $ne: "hidden_plans" } }).toArray();
      return plans.filter(p => !hiddenIds.has(p.id) && !hiddenIds.has(p.squarePlanId));
    } catch (error) {
      console.error("Error fetching plans:", error);
      throw new Error("Failed to fetch plans from the database.");
    }
  }
}