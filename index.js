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
    app.post("/books", async (req, res) => {
      const book = req.body;
      book.createAt = new Date();
      const query = {
        bookTitle: book.bookTitle,
        email: book.email,
      };
      const isExist = await booksCollection.findOne(query);
      if (isExist) {
        return res.send("This book already added in the database.");
      }
      const result = await booksCollection.insertOne(book);
      res.send(result);
    });
    app.get("/books", async (req, res) => {
      const email = req.query.userEmail;

      const page = Number(req.query.page);
      const limit = Number(req.query.limit);
      const skip = (page - 1) * limit;
      const query = {};
      let sortOperation = {};
      const sort = req.query.price;

      if (email) {
        query.librarianEmail = email;
      }
      if (sort === "price-asc") {
        sortOperation.price = 1;
      }
      if (sort === "price-desc") {
        sortOperation.price = -1;
      }
      if (sort === "name-asc") {
        sortOperation.bookTitle = 1;
      }
      if (sort === "name-desc") {
        sortOperation.bookTitle = -1;
      }
      const bookCategory = req.query.bookCategory;

      if (bookCategory) {
        if (bookCategory.split(" ").length === 1) {
          const bookCapitalize =
            bookCategory.charAt(0).toUpperCase() +
            bookCategory.slice(1).toLowerCase();
          query.bookCategory = bookCapitalize;
        } else {
          query.bookCategory = bookCategory;
        }
      }

      const result = await booksCollection
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort(sortOperation)
        .toArray();
      res.send(result);
    });
    app.get("/books/latest", async (req, res) => {
      const query = {};
      const result = await booksCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });
    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;

      const query = {
        _id: new ObjectId(id),
      };
      const result = await booksCollection.findOne(query);
      res.send(result);
    });
    app.patch("/books/:id", async (req, res) => {
      const { id } = req.params;
      const updateDoc = req.body;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await booksCollection.updateOne(query, {
        $set: updateDoc,
      });
      res.send(result);
    });
    app.delete("/books/:id", async (req, res) => {
      const { id } = req.params;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await booksCollection.deleteOne(query);
      res.send(result);
    });
    //User related APIs
    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      userInfo.role = "User";
      userInfo.createAt = new Date();
      const query = { email: userInfo.email };
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        return res.send("Already Added in the database.");
      }
      const result = await usersCollection.insertOne(userInfo);
      res.send(result);
    });
    app.get("/users", verifyFirebaseToken, async (req, res) => {
      const query = {};
      const role = req.query.role;

      if (role) {
        query.role = role.charAt(0).toUpperCase() + role.slice(1);
      }

      const result = await usersCollection.find(query).toArray();

      if (role) {
        return res.send({ totalLibraries: result.length });
      }
      res.send(result);
    });

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
