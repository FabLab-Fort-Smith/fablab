import { db } from "@/lib/database";
import fs from 'fs';
import path from 'path';

export default class PlansModel {
  static async getPlans() {
    try {
        // ALWAYS prefer plans.json as the source of truth if it exists
        // This prevents stale database records from showing incorrect pricing
        try {
            const plansPath = path.join(process.cwd(), 'plans.json');
            if (fs.existsSync(plansPath)) {
                const fileContents = fs.readFileSync(plansPath, 'utf8');
                const jsonPlans = JSON.parse(fileContents);
                if (jsonPlans && jsonPlans.length > 0) {
                    return jsonPlans;
                }
            }
        } catch (err) {
            console.error("Failed to read plans.json", err);
        }

        // Fallback to DB if JSON fails
      const dbPlans = await db.dbPlans();
      let plans = await dbPlans.find({}).toArray();
      
      return plans;
    } catch (error) {
      console.error("Error fetching plans:", error);
      throw new Error("Failed to fetch plans from the database.");
    }
  }
}