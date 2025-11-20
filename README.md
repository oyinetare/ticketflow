# Ticketflow

Playground event ticketing distributed system for browsing events, purchase tickets, and process payments to learn distributed systems concepts through hands-on experience.

Done with a **build, break then fix** approach i.e. steps on how requirements are built, what issues they solve and how it works starting with a monolith and gradually breaking it into distributed components progressively.

## Table of Contents

- [Prerequisites](#prerequisites)
- [How To Run](#how-to-run)
- [Requirements](#requirements)
- [Steps - How it works/How to reproduce this project](#steps)
  - [1 - Monolith](#1---monolith)
  - [2 - Scaling 1: Queues + Redis Locking + API improvements](#2---scaling-1-queues--redis-locking--api-improvements)
  - [3 - Scaling 2: Microservices](#3---scaling-2-microservices)
  - [4 - Advanced patterns: Saga & Event Sourcing](#4--advanced-patterns-saga--event-sourcing)
- [References](#references)

---

## Prerequisites
- **Node.js** (v18+ recommended)
  ```bash
  node --version  # should show v18.x.x or higher
  ```
- **Docker & Docker Compose**
  ```bash
  docker --version         # should show Docker version 20.x.x or higher
  docker-compose --version # should show docker-compose version 1.29.x or higher
  ```
- **npm** or **yarn**
  ```bash
  npm --version  # should show 8.x.x or higher
  ```
- **cURL** or **HTTPie** (for API testing)
- **Artillery** (for load testing - installed via npm)

---

## How To Run

### Running Monolith, Steps 1-2
```bash
# Terminal 1

# clone the repo
git clone https://github.com/oyinetare/ticketflow.git
cd ticketflow

cd monolith
npm install
docker-compose up -d
npm run dev

# Terminal 2 - test basic functionality

# get all events
curl http://localhost:3000/api/v2/events

# purchase a ticket
curl -X POST http://localhost:3000/api/v2/tickets/purchase \
  -H "Content-Type: application/json" \
  -d '{"eventId": "3", "userId": "test-user"}'

# stop docker
docker-compose down
```
### Running Microservices, Steps 3-4

---

## Requirements
### Functional (What the system does)
1. Event management
	- View all avaialable events (search events)
	- View event details
	- Create event

2. Ticket purchasing
	- Purchase event tickets
	- Reserve tickets (prevent others from buying same tickets)
	- Process payment
	- Confirm ticket purchase
	- Handle failed payments gracefully

3. User Features
	- View purchased tickets
	- Get ticket confirmation
	- View purchase history

4. Inventory Management
	- Track available tickets per event
	- Prevent overselling (no negative inventory)
	- Release tickets if payment fails

### Non-Functional (How well the system works)

1. Reliability: The system should prioritize availability i.e. 99.9% uptime (8.7 hours downtime/year) for searching & viewing events, but should prioritize consistency for booking events (no double booking, never sell same ticket twice, charge exactly once per ticket, no lost tickets or payments). Eventual consistency is OK (few seconds delay)

2. Fault tolerant: System stays up if one service fails

3. Scalability: The system should be scalable and able to handle high throughput in the form of popular events (10 million users, one event), Add more servers during peak times, Database Scaling(Handle millions of tickets/events), Queue Scaling(Process thousands of payments per minute)

4. Performance: The system should have low latency search (i.e. Response Time of Browse events < 200ms - 500ms) & purchasing < 3 seconds (including payment)

5. The system is read heavy, and thus needs to be able to support high read throughput (100:1), Handle 1000 concurrent users

6. High concurrency

7. Security: No storing credit cards, Rate limiting to prevent abuse for API, Data Privacy(Secure user information)

---

## Steps - How it works/How to reproduce this project

- [x] 1 — Monolith
- [x] 2 — Scaling 1: Queues + Redis Locking + API improvements
- [x] 3 — Scaling 2: Microservices
- [ ] 4 - Advanced patterns: Saga & Event Sourcing

### 1 - Monolith

<!-- - folder structure
- architecture diagram
- what part of the requirements does it solve
- what problems are introduced, leading up to next sectio -->

#### Architecture Diagram

```
	  client
		|
 API (/api/events, /api/tickets)
		|
	services (event service, payment service, ticket service)
		|
	sqlite db
```

#### Core Entities

- Event
- Ticket
- Payment

```typescript
export interface Event {
  id: string;
  name: string;
  venue: string;
  date: Date;
  totalTickets: number;
  availableTickets: number;
  price: number;
  createdAt: Date;
}

export interface Ticket {
  id: string;
  eventId: string;
  userId: string;
  purchaseDate: Date;
  price: number;
  status: "pending" | "confirmed" | "cancelled";
}

export interface Payment {
  id: string;
  ticketId: string;
  userId: string;
  amount: number;
  status: "pending" | "completed" | "failed";
  processedAt?: Date;
  createdAt: Date;
}
```

#### DB

```SQL
TABLE events (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	venue TEXT NOT NULL,
	date TEXT NOT NULL,
	totalTickets INTEGER NOT NULL,
	availableTickets INTEGER NOT NULL,
	price REAL NOT NULL,
	createdAt TEXT NOT NULL
)

TABLE tickets (
	id TEXT PRIMARY KEY,
	eventId TEXT NOT NULL,
	userId TEXT NOT NULL,
	purchaseDate TEXT NOT NULL,
	price REAL NOT NULL,
	status TEXT NOT NULL,
	FOREIGN KEY (eventId) REFERENCES events(id)
)

TABLE payments (
	id TEXT PRIMARY KEY,
	ticketId TEXT NOT NULL,
	userId TEXT NOT NULL,
	amount REAL NOT NULL,
	status TEXT NOT NULL,
	processedAt TEXT,
	createdAt TEXT NOT NULL,
	FOREIGN KEY (ticketId) REFERENCES tickets(id)
)
```

#### API or System Interface

```bash
GET  /api/events                # get all events
GET  /api/events/:id            # get single event by id
POST /api/events                # create event
POST /api/tickets/purchase      # purchase ticket
GET  /api/tickets/user/:userId  # get users tickets
```

#### Services

- Event Service
- Payment Service
- Ticket Service

#### Flow: What part of the requirements does it solve
- simple Express app
	- Middleware
		- cors
		- express.json(), so that app can read JSON data sent from the client (like in POST or PUT requests) and make it available in req. body. Without it, Express cannot understand JSON data in requests [ExpressJS express.json() Function](https://www.geeksforgeeks.org/web-tech/express-js-express-json-function/)
		- logging middleware
		- error handler
	- init db
- Event management: View all avaialable events (search events) + View event details +  Create event
  - getAllEvents, getEventById, createEvent
- Ticket purchasing: Purchase event tickets + Process payment + Confirm ticket
  1. check event availability **ISSUE**: causes RACE CONDITION
  2. create ticket
  3. process payment **ISSUE**: SLOW & causes problems
  4. Update ticket status & inventorypurchase

#### Tech Stack used here
- Node.js
- Sqlite for db

#### Notes
- using nouns for resource names & plural nouns to name collection URIs., i.e.  `/events` instead of `/create-events`. The verbal action on a URI is already implied by the HTTP `GET`, `POST`, `PUT`, `PATCH`, and `DELETE` methods
- relationships kept simple and flexible
- no API versioning for now
-  Interface types dont mirror the internal structure of db, so theres less risk of increasing the attack surface and might lead to data leakage in API and  API is an abstraction of the database
- Implement asynchronous methods in services

#### Issues in design i.e. what problems are introduced, leading up to next section
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

---

### 2 - Scaling 1: Queues + Redis Locking + API improvements


## ** How do we improve the booking experience by reserving tickets?: Dealing w contention
- pessimistic locking
- status & expiration time with cron
- mpicit status with tatus and time expiration
- distirbuted lock with TTL

## Scaling reads: How is the view API going to scale to support 10s of millions of concurrent requests during popular events?
- cachign, lb, horizontal scaling

## ** Real time updates; How will the system ensure a good user experience during high-demand events with millions simultaneously booking tickets?
- SSE for real time seat updates
- Virtual waiting queue for xtrmemly popular events

## ** How can you improve search to ensure we meet our low latency requirements?
- indexinfg & sql qurery ptimization
- full-text idnexes in db
- se a full text  search engine liem elastic db

## How can you speed up frequently repeated search queries and reduce load on our search infrastructure?
- implement caching trategies using redis and memcached
- impoklement query result caching and edge caching techniques

## API improvement
- Implement asynchronous methods
- Implement data pagination and filtering
- Implement versioning
- HATEOS link


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


- Implement asynchronous methods
- Implement data pagination and filtering
- Implement versioning
- HATEOS links
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

### 4 - Advanced patterns: Saga & Event Sourcing

---

## References

- [Microservices architecture style](https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/microservices)
- [Learn Docker by building a Microservice by Dave Kerr](https://dwmkerr.com/learn-docker-by-building-a-microservice/)
- [ExpressJS express.json() Function](https://www.geeksforgeeks.org/web-tech/express-js-express-json-function/)