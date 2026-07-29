require("dotenv").config();
const express = require("express");
const cors = require("cors");
const dns = require("dns");
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const serviceAccount = require("./book_courier-firebase-admin_sdk.json");
initializeApp({
  credential: cert(serviceAccount),
});

//middleware
app.use(express.json());
app.use(cors());
const verifyFirebaseToken = async (req, res, next) => {
  if (!req.headers.accesstoken) {
    return res.status(401).send({ message: "Unauthorized access!" });
  }
  const token = req.headers.accesstoken.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access!" });
  }
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    req.token_email = decodedToken.email;

    next();
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized access!" });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7c0davw.mongodb.net/?appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("BookCourier_BD");
    const usersCollection = db.collection("users");
    const booksCollection = db.collection("books");
    const ordersCollection = db.collection("orders");
    const reviewsCollection = db.collection("reviews");
    const wishlistsCollection = db.collection("wishlists");

    //Orders related APIs

    //Payment methods

    // Books related APIs
    
    //User related APIs

    //Review related apis

    app.get("/", async (req, res) => {
      res.send("BookCourier is Connected to mongoDB.");
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`BookCourier app listening on port ${port}`);
});
