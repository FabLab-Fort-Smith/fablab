// lib/database.js
import { MongoClient } from "mongodb";

class Database {
    constructor() {
        if (!Database.instance) {
            this.client = new MongoClient(process.env.MONGODB_URI, {
                minPoolSize: 5,
                maxPoolSize: 10,
            });
            this._instance = null;
            Database.instance = this;
        }
        return Database.instance;
    }

    async connect() {
        if (this._instance) {
            console.log("🔄 Closing existing MongoDB connection...");
            await this.client.close();
            this._instance = null;
        }
    
        if (!this._instance) {
            try {
                await this.client.connect();
                console.log("✅ MongoDB Connected");
                console.log("Using Database:", process.env.MONGODB_NAME || 'FabLab-Local');
                this._instance = this.client.db(process.env.MONGODB_NAME || 'FabLab-Local');
            } catch (error) {
                console.error("❌ MongoDB Connection Error:", error);
                throw new Error("Failed to connect to MongoDB");
            }
        }
        return this._instance;
    }
    
    

    getDb() {
        if (!this._instance) throw new Error("Database not initialized");
        return this._instance;
    }

    async dbUsers() {
        await this.connect(); // ✅ Ensure the database connection is established before returning the collection
        return this._instance.collection("users");
    }

    async dbPlans() {
        await this.connect(); // ✅ Ensure the database connection is established before returning the collection
        return this._instance.collection("plans");
    }

    async dbNotifications() {
        await this.connect();
        return this._instance.collection("notifications");
    }

    async dbContactSubmissions() {
        await this.connect();
        return this._instance.collection("contact_submissions");
    }
}

export const db = new Database();
