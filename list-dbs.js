const { MongoClient } = require('mongodb');

const uri = "mongodb://critter:Zapatas2024@23.94.251.158:27017/?directConnection=true&serverSelectionTimeoutMS=2000&authSource=admin&appName=mongosh+2.3.3";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const admin = client.db().admin();
    const result = await admin.listDatabases();
    console.log("Databases:");
    result.databases.forEach(db => console.log(` - ${db.name}`));
    
    // Check collections in FabLab-Local
    const db = client.db("FabLab-Local");
    const collections = await db.listCollections().toArray();
    console.log("\nCollections in FabLab-Local:");
    collections.forEach(c => console.log(` - ${c.name}`));

  } finally {
    await client.close();
  }
}
run().catch(console.dir);
