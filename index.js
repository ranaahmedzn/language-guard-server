const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SK)

// middleware
app.use(cors())
app.use(express.json())

// verify jwt
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({error: true, message: 'unauthorized access'})
  }
  const token = authorization.split(' ')[1]
  // console.log(token)
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: "forbidden access" });
    }
    req.decoded = decoded;
    // console.log(decoded)
    next();
  });
}


// const uri = 'mongodb://localhost:27017'
// const client = new MongoClient(uri)

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.h2fzsvj.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect();

    const classCollection = client.db("languageDB").collection("classes")
    const instructorCollection = client.db("languageDB").collection("instructors")
    const reviewCollection = client.db("languageDB").collection("reviews")
    const userCollection = client.db("languageDB").collection("users")
    const bookingCollection = client.db("languageDB").collection("bookings")
    const paymentCollection = client.db("languageDB").collection("payments")


    // jwt api
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middleware to verify student, admin or instructor
    const verifyStudent = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "student") {
        return res.status(403).send({ error: true, message: "forbidden access" });
      }
      next();
    };

    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "instructor") {
        return res.status(403).send({ error: true, message: "forbidden access" });
      }
      next();
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ error: true, message: "forbidden access" });
      }
      next();
    };

    // users api
    app.get('/users', verifyJWT, verifyAdmin, async(req, res) => {
      const result = await userCollection.find().toArray()
      res.send(result);
    })

    app.post('/users', async(req, res) => {
      const user = req.body;
      // console.log(user)
      const query = { email: user.email };

      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }

      const result = await userCollection.insertOne(user)
      res.send(result)
    })

    app.get("/users/role/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      // console.log(req.decoded.email, email)

      if (email !== req.decoded.email) {
        return res.send({isStudent: false, isInstructor: false, isAdmin: false})
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);

      const isStudent = user?.role === "student"
      const isInstructor = user?.role === "instructor" 
      const isAdmin = user?.role === "admin" 

      res.send({isStudent, isInstructor, isAdmin});
    });

    app.patch('/users/:id', verifyJWT, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)}

      const updatedClass = {
        $set: {
          role: 'instructor'
        },
      };
      const result = await userCollection.updateOne(filter, updatedClass)
      res.send(result)
    })

    app.put('/users/:id', verifyJWT, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)}

      const updatedClass = {
        $set: {
          role: 'admin'
        },
      };
      const result = await userCollection.updateOne(filter, updatedClass)
      res.send(result)
    })

    // classes related apis
    app.get('/classes', async(req, res) => {
        const result = await classCollection.find().toArray();
        res.send(result)
    })

    app.get('/popular-classes', async(req, res) => {
        const result = await classCollection.find().sort({students: -1}).limit(6).toArray();
        res.send(result)
    })

    app.get('/enrolled-classes', verifyJWT, verifyStudent, async(req, res) => {
      const email = req.decoded.email;

      if(email !== req.query.email){
        return res.status(401).send({error: true, message: 'unauthorized access'})
      }

      const query = {email: email}

      const userPayments = await paymentCollection.find(query).toArray();

      const paymentsClassIds = userPayments.map(payment => new ObjectId(payment.classId));

      const enrolledClasses = await classCollection.find({ _id: { $in: paymentsClassIds } }).toArray();

      res.send(enrolledClasses);
    })

    app.get('/classes/:email', verifyJWT, async(req, res) => {
      const email = req.decoded.email;

      if(email !== req.params.email){
        return res.status(401).send({error: true, message: 'unauthorized access'})
      }

      const query = {instructorEmail: email}
      const result = await classCollection.find(query).toArray()
      res.send(result)
    })

    app.post('/classes', verifyJWT, async(req, res) => {
      const newClass = req.body;
      // console.log(newClass)

      const result = await classCollection.insertOne(newClass)
      res.send(result)
    })

    // update class by instructor
    app.patch('/classes/update/:id', verifyJWT, async(req, res) => {
      const id = req.params.id;
      const updatedClass = req.body;

      // console.log(updatedClass)
      const filter = {_id: new ObjectId(id)}

      const updatedDoc = {
        $set: {
          ...updatedClass
        },
      };
      const result = await classCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })

    // update class by the admin
    app.patch('/classes/feedback/:id', verifyJWT, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const {feedback} = req.body;
      // console.log(feedback);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: feedback,
        },
      };

      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    app.patch('/classes/:id', verifyJWT, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)}

      const updatedClass = {
        $set: {
          status: 'approved'
        },
      };
      const result = await classCollection.updateOne(filter, updatedClass)
      res.send(result)
    })

    app.put('/classes/:id', verifyJWT, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)}

      const updatedClass = {
        $set: {
          status: 'denied'
        },
      };
      const result = await classCollection.updateOne(filter, updatedClass)
      res.send(result)
    })

    // instructors related apis
    app.get('/instructors', async(req, res) => {
      const result = await instructorCollection.find().toArray()
      res.send(result)
    })

    app.get('/popular-instructors', async(req, res) => {
      const pipeline = [
        {
          $lookup: {
            from: 'classes',
            localField: 'email',
            foreignField: 'instructorEmail',
            as: 'classes'
          }
        },
        {
          $addFields: {
            totalStudents: { $sum: '$classes.students' }
          }
        },
        {
          $sort: { totalStudents: -1 }
        },
        {
          $limit: 6
        },
        {
          $project: {
            _id: 1,
            name: 1,
            email: 1,
            image: 1,
            totalStudents: 1
          }
        }
      ];

      const result = await instructorCollection.aggregate(pipeline).toArray()
      res.send(result)
    })


    // review api
    app.get('/reviews', async(req, res) => {
      const result = await reviewCollection.find().sort({date: -1}).toArray()
      res.send(result)
    })

    app.post('/reviews', verifyJWT, async(req, res) => {
      const feedback = req.body;
      const result = await reviewCollection.insertOne(feedback)
      res.send(result)
    })

    // bookings api
    app.get('/bookings', verifyJWT, async(req, res) => {
      const email = req.query.email;

      if(email !== req.decoded.email){
        return res.status(401).send({error: true, message: 'unauthorized access'})
      }
      const query = {studentEmail: email}
      const result = await bookingCollection.find(query).toArray()
      res.send(result)
    })

    app.get('/bookings/:id', verifyJWT, verifyStudent, async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await bookingCollection.findOne(query)
      res.send(result)
    })

    app.post('/bookings', verifyJWT, verifyStudent, async(req, res) => {
      const selectedClass = req.body;
      const result = await bookingCollection.insertOne(selectedClass)
      res.send(result)
    })

    app.delete('/bookings/:id', verifyJWT, verifyStudent, async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await bookingCollection.deleteOne(query)
      res.send(result)
    })

    // payment intent api
    app.post("/create-payment-intent", verifyJWT, verifyStudent, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100)
    
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
    
      res.send({ clientSecret: paymentIntent.client_secret });
    });

     // payment related apis
     app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertedResult = await paymentCollection.insertOne(payment);

      const query = {_id: new ObjectId(payment.bookingId)}
      const deletedResult = await bookingCollection.deleteOne(query);

      const filter = {_id: new ObjectId(payment.classId)}
      const selectedClass = await classCollection.findOne(filter)

      const updatedClass = {
        $set: {
          availableSeats: `${selectedClass.availableSeats - 1}`,
          students: `${selectedClass.students + 1}`
        },
      };
      const updatedResult = await classCollection.updateOne(filter, updatedClass)

      res.send({ insertedResult, deletedResult, updatedResult});
    });

    app.get("/payments", verifyJWT, verifyStudent, async(req, res) => {
      const email = req.decoded.email;

      if(email !== req.query.email){
        return res.status(401).send({error: true, message: 'unauthorized access'})
      }

      const query = {email: email}
      const payments = await paymentCollection.find(query).sort({date: -1}).toArray();
      res.send(payments);
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Server is running..')
})

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`)
})