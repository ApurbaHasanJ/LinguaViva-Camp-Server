const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.port || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

// const email = req.query.email;
//       if(!email){
//         res.send([])
//       }
//       const decodedEmail = req.decoded.email
//       if(email !== decodedEmail){
//         return res.send(403).send({error: true, message : 'forbidden access'})
//       }

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
    await client.connect();

    const usersCollection = client.db("LVCdb").collection("users");
    const classesCollection = client.db('LVCdb').collection("classes");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const userToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ userToken });
    });

    // get all users
    app.get("/users", async (req, res) => {
      
      const result = await usersCollection.find().toArray();
      res.send(result);
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
      const updateRole = {
        // Set the role based on the request body
        $set: {
          role: req.body.role,
        },
      };

      const result = await usersCollection.updateOne(filter, updateRole);
      res.send({ modifiedCount: result.modifiedCount }); // Send modified count
    });

   // Store Classes 
app.post('/classes', async (req, res) => {
  const cls = req.body;
  cls.status = 'pending';
  const result = await classesCollection.insertOne(cls)
  res.send(result);
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
