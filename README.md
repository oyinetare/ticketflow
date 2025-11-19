# Ticketflow

Playground event ticketing distributed system for browsing events, purchase tickets, and process payments.

Done with **break and fix it approach** i.e. steps on how requirements are built, what issues they solve and how it works starting with a monolith and gradually breaking it into distributed components progressively.

## Table of Contents

- [How to run](#how-to-run)
- [Requirements](#requirements)
- [Steps - How it works](#steps)
  - [Monolith](#1---monolith)
  - [Queues + Redis Locking + API improvements](#2---scaling-1-queues--redis-locking--api-improvements)
  - [Microservices](#3---scaling-2-microservices)
  - [Advanced patterns: Saga & Event Sourcing](#4--advanced-patterns-saga--event-sourcing)
- [References](#references)

---

## How To Run

## Requirements

## Steps

- [x] 1 — Monolith
- [x] 2 — Scaling 1: Queues + Redis Locking + API improvements
- [x] 3 — Scaling 2: Microservices
- [ ] 4 — Advanced patterns: Saga & Event Sourcing

### 1 - Monolith

- #### flow

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

- #### ISSUES in design
  - Race conditions when checking event availability
  - Processing payment SLOW & causes problems
  - Lost tickets when payments fail
  - Multiple users can buy the same ticket
  - Database locks cause timeouts
  - Inconsistent inventory counts
  - Using sqlite whcih doesnt scale well in distributed systems
    - different from client/server SQL database engines such as MySQL, Oracle, PostgreSQL, or SQL Server since SQLite is trying to solve a different problem
    - Client/server SQL database engines strive to implement a shared repository of enterprise data and emphasize **scalability, concurrency, centralization, and control** whereas SQLite strives to provide local data storage for individual applications and devices. SQLite **emphasizes economy, efficiency, reliability, independence, and simplicity.**
    - SQLite does not compete with client/server databases. SQLite competes with fopen().
    - SQLite database requires no administration, it works well in devices that must operate without expert human support
    - Client/server database engines are designed to live inside a lovingly-attended datacenter at the core of the network. SQLite works there too, but SQLite also thrives at the edge of the network, fending for itself while providing fast and reliable data services to applications that would otherwise have dodgy connectivity
    - SQLite is a good fit for use in "internet of things" devices.
    - Generally speaking, any site that gets fewer than 100K hits/day should work fine with SQLite
    - **Reference**: https://sqlite.org/whentouse.html

### 2 - Scaling 1: Queues + Redis Locking + API improvements

#### Imporovements to design based on issues above

- **Sqlite**
  - **Sqlite nto designed for Client/Server Applications**: If there are many client programs sending SQL to the same database over a network, then use a client/server database engine instead of SQLite. SQLite will work over a network filesystem, but because of the latency associated with most network filesystems, performance will not be great. Also, file locking logic is buggy in many network filesystem implementations (on both Unix and Windows). If file locking does not work correctly, two or more clients might try to modify the same part of the same database at the same time, resulting in corruption. Because this problem results from bugs in the underlying filesystem implementation, there is nothing SQLite can do to prevent it.

  - **High Concurrency**: SQLite supports an unlimited number of simultaneous readers, but it will only allow one writer at any instant in time. For many situations, this is not a problem. Writers queue up. Each application does its database work quickly and moves on, and no lock lasts for more than a few dozen milliseconds. But there are some applications that require more concurrency, and those applications may need to seek a different solution.

- **Proposed solution**
- Redis for distributed locking to prevent race conditions
- Bull for Queue-based async processing to improve response times
- Idempotency to prevent duplicate charges
- Proper rollback on failures

### 3 - Scaling 2: Microservices

- move to PostgreSQL

### 4 - Advanced patterns: Saga & Event Sourcing

## References

- api vaersioning
- idempotency
  - handler
  - if not POST, then next
  - get idempotency key from redis cache or generate if one doesnt exist
    - Generate key based on user, endpoint, and request body
  - check for cached response with idempotency key
  - store original json method using redis cache
  - ovveride json method to cache response
  - attach key to request for use in handlers
- links

The lockfile is important because it:

Ensures consistent installs across different machines
Locks specific versions of all dependencies and sub-dependencies
Speeds up CI/CD builds
Helps prevent security vulnerabilities by pinning versions
