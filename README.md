# ticketflow

- [ ] 1-monolith

- **flow**

```
                  client
                    |
                    |
                    |
          /api (/events, /tickets)
                    |
                    |
                    |
                services
                    |
                    |
                    |
                sqlite db
```

- event
  - getAllEvents, getEventById, createEvent
- purchasing ticket
  - 1. check event availability **ISSUE**: causes RACE CONDITION
  - 2. create ticket
  - 3. process payment **ISSUE**: SLOW & causes problems
  - 4. Update ticket status & inventory
- getTicketsByUserId

- **REST API endpoints**

  - /api/events
    - GET / # get all events
    - GET /:id # get single event by id
    - POST / # create event
  - /api/tickets
    - POST /purchase # purchase ticket
    - GET /user/:userId # get users tickets

- **sqlite db**

  - TABLES
    - events
      - id, name, venue, date, totalTickets, availableTickets, price, createdAt
    - tickets
      - id, eventId, userId, purchaseDate, price, status
      - FOREIGN KEY (eventId) REFERENCES events(id)
    - payments
      - id,
        ticketId, userId, amount, status, processedAt, createdAt,
      - FOREIGN KEY (ticketId) REFERENCES tickets(id)

- **ISSUES**
  - Race conditions when checking event availability
  - processing payment SLOW & causes problems
  - Using sqlite
