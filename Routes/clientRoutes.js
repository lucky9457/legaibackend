const express = require("express");
const Client = require("../models/client");

const router = express.Router();

// Route to create a new client
router.post("/clients", async (req, res) => {
  try {
    const { name, email, mobileNumber, remarks } = req.body;
    const newClient = new Client({
      name,
      email,
      mobileNumber,
      remarks
    });
    await newClient.save();
    res.status(201).send(newClient);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// Route to retrieve all clients
router.get("/clients", async (req, res) => {
  try {
    const clients = await Client.find({});
    res.status(200).send(clients);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

router.delete("/clients/:id", async (req, res) => {
    try {
      const client = await Client.findByIdAndDelete(req.params.id);
      if (!client) {
        return res.status(404).send({ error: "Client not found" });
      }
      res.status(200).send({ message: "Client deleted successfully" });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

module.exports = router;
