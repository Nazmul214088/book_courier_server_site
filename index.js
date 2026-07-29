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

    app.post("/orders", async (req, res) => {
      const order = req.body;
      order.orderedAt = new Date().toDateString();
      order.status = "pending";
      order.paymentStatus = "Unpaid";
      const query = {
        bookName: order.bookTitle,
        email: order.email,
      };
      const isExist = await ordersCollection.findOne(query);
      if (isExist) {
        return res.send("This book already ordered you.");
      }
      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });
    app.get("/orders", verifyFirebaseToken, async (req, res) => {
      const query = {};

      const librarianEmail = req.query.librarianEmail;
      const status = req.query.status;
      if (librarianEmail) {
        query.librarianEmail = librarianEmail;
      }
      if (status) {
        query.status = status;
      }
      const result = await ordersCollection.find(query).toArray();
      if (status) {
        return res.send({ total: result.length });
      }
      res.send(result);
    });
    app.get("/orders/:email", verifyFirebaseToken, async (req, res) => {
      const { email } = req.params;
      const decodedEmail = req.token_email;
      console.log(decodedEmail);

      const status = req.query.status;
      const query = {
        email,
      };
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "Forbidden Access!s" });
      }
      if (status) {
        query.status = status;
      }
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });
    app.patch("/orders/:id", verifyFirebaseToken, async (req, res) => {
      const { id } = req.params;
      const query = {
        _id: new ObjectId(id),
      };
      const updateDoc = {
        status: "cancelled",
      };
      const result = await ordersCollection.updateOne(query, {
        $set: updateDoc,
      });
      res.send(result);
    });
    app.delete("/orders/:id", async (req, res) => {
      const bookId = req.params.id;
      const query = { bookId };
      const result = await ordersCollection.deleteOne(query);
      res.send(result);
    });

    //Payment methods
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const totalCost = parseInt(paymentInfo.totalCost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "bdt",
              unit_amount: totalCost,
              product_data: {
                name: paymentInfo.bookName,
              },
            },

            quantity: 1,
          },
        ],
        mode: "payment",

        metadata: {
          bookName: paymentInfo.bookName,
          bookId: paymentInfo.bookId,
        },
        success_url: `${process.env.CLIENT_URL}/dashboard/payment_success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_URL}/dashboard/payment_cancel`,
      });
      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const updateDoc = {
        transaction: session.payment_intent,
        paymentStatus: session.payment_status,
        paymentDate: new Date().toDateString(),
      };
      const query = {
        _id: new ObjectId(session.metadata.bookId),
      };
      const result = await ordersCollection.updateOne(query, {
        $set: updateDoc,
      });
      res.send(result);
    });

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
    app.get("/users/:email", verifyFirebaseToken, async (req, res) => {
      const { email } = req.params;
      const decodedEmail = req.token_email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "Forbidden Access!" });
      }
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });
    app.get("/users/:email/role", verifyFirebaseToken, async (req, res) => {
      const { email } = req.params;
      const query = {
        email,
      };
      const result = await usersCollection.findOne(query);
      res.send(result.role);
    });
    app.patch("/users/:email", async (req, res) => {
      const updateInfo = req.body;
      const { email } = req.params;
      const query = {
        email,
      };
      const result = await usersCollection.updateOne(query, {
        $set: updateInfo,
      });
      res.send(result);
    });

    //Review related apis
    app.post("/reviews", async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });
    app.get("/reviews", async (req, res) => {
      const bookId = req.query.bookId;
      let query = {};
      if (bookId) {
        query = {
          bookId,
        };
      }
      const result = await reviewsCollection.find(query).toArray();
      res.send(result);
    });

    //Wishlist related APIs
    app.post("/wishlist", async (req, res) => {
      const wishlist = req.body;
      const result = await wishlistsCollection.insertOne(wishlist);
      res.send(result);
    });
    app.get("/wishlist", verifyFirebaseToken, async (req, res) => {
      const userEmail = req.query.userEmail;
      const decodedEmail = req.token_email;
      const bookId = req.query.bookId;
      const query = {};
      if (userEmail) {
        query.userEmail = userEmail;
        if (userEmail !== decodedEmail) {
          return res.status(403).send({ message: "Forbidden Access!" });
        }
      }
      if (bookId && userEmail) {
        query.userEmail = userEmail;
        query.bookId = bookId;
        const result = await wishlistsCollection.findOne(query);
        return res.send({ isWishListed: !!result });
      }
      const result = await wishlistsCollection.find(query).toArray();
      res.send(result);
    });
    app.delete("/wishlist/:bookId", async (req, res) => {
      const bookId = req.params.bookId;
      const query = { bookId };
      const result = await wishlistsCollection.deleteOne(query);
      res.send(result);
    });

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
