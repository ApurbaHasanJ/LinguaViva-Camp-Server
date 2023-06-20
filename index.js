const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.port || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  console.log({ authorization });
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    console.log({ err });
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@believer.igrxpib.mongodb.net/?retryWrites=true&w=majority`;

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
    // await client.connect();

    const usersCollection = client.db("LVCdb").collection("users");
    const classesCollection = client.db("LVCdb").collection("classes");
    const bookedClassesCollection = client
      .db("LVCdb")
      .collection("bookedClasses");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const userToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ userToken });
    });

    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "Admin")
        return res
          .status(403)
          .send({ error: true, message: "Forbidden Access" });
      next();
    };

    // verify admin middleware
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "Instructor")
        return res
          .status(403)
          .send({ error: true, message: "Forbidden Access" });
      next();
    };

    // check admin role
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "Admin" };
      res.send(result);
    });

    // check instructor role
    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === "Instructor" };
      res.send(result);
    });

    // get all users by admin
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Get all instructors
    app.get("/instructors", async (req, res) => {
      const instructors = await usersCollection
        .find({ role: "Instructor" })
        .toArray();
      res.send(instructors);
    });

    // Get the last added instructor
    app.get("/popular-instructors", async (req, res) => {
      const popularInstructor = await usersCollection
        .find({ role: "Instructor" })
        .limit(6)
        .toArray();

      res.send(popularInstructor);
    });

    // Store user data
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };

      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User Already Exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // User Role Update
    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateData = {
        $set: { role: req.body.role, btn: false },
      };

      const result = await usersCollection.updateOne(filter, updateData);
      res.send({ modifiedCount: result.modifiedCount });
    });

    // Store Classes
    app.post("/classes", async (req, res) => {
      const cls = req.body;
      cls.status = "pending";
      cls.availableSeats = Number(cls.availableSeats);
      cls.price = Number(cls.price);
      const result = await classesCollection.insertOne(cls);
      res.send(result);
    });

    // Get Instructor's Classes
    app.get("/classes", async (req, res) => {
      const result = await classesCollection.find({}).toArray();
      res.send(result);
    });

    // Last 6 classes
    app.get("/popular-classes", async (req, res) => {
      const result = await classesCollection
        .find({ status: "approved" })
        .sort({ _id: -1 })
        .limit(6)
        .toArray();

      res.send(result);
    });

    // Update Classes by Instructor
    app.patch("/classes/:id", verifyJWT, verifyInstructor, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateClass = {
        $set: {
          clsTitle: req.body.title,
          thumbnailUrl: req.body.thumbnailUrl,
          availableSeats: Number(req.body.availableSeats),
          price: Number(req.body.price),
        },
      };
      const result = await classesCollection.updateOne(filter, updateClass);
      res.send({ modifiedCount: result.modifiedCount });
    });

    // Update Class Status by Admin
    app.patch("/classes/:id/status", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateStatus = {
        $set: { status: req.body.status },
      };

      if (req.body.status === "denied") {
        updateStatus.$set.feedback = req.body.feedback;
      }

      const result = await classesCollection.updateOne(filter, updateStatus);
      res.send({ modifiedCount: result.modifiedCount });
    });

    // Get Approved Classes
    app.get("/classes/approved", async (req, res) => {
      const approvedClasses = await classesCollection
        .find({ status: "approved" })
        .toArray();
      res.send(approvedClasses);
    });

    // Store Booked classes by students
    app.post("/bookedClasses", async (req, res) => {
      const cls = req.body;
      const result = await bookedClassesCollection.insertOne(cls);
      res.send(result);
    });

    // Get student Booked classes
    app.get("/bookedClasses", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.send(403).send({ error: true, message: "forbidden access" });
      }

      const query = { email: email };
      const result = await bookedClassesCollection.find(query).toArray();
      res.send(result);
    });

    // delete booked classes
    app.delete("/bookedClasses/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const query = { _id: new ObjectId(id) };
        const result = await bookedClassesCollection.deleteOne(query);
        if (result.deletedCount === 1) {
          res.send("Successfully deleted the booked class.");
        } else {
          res.status(404).send("Booked class not found.");
        }
      } catch (error) {
        res
          .status(500)
          .send("An error occurred while deleting the booked class.");
      }
    });

    // create payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("LVC is running");
});

app.listen(port, () => {
  console.log(`LVC is running on port ${port}`);
});
