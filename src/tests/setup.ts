import "dotenv/config";

// Every module that reaches for DATABASE_URL must get the test database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.AUTH_SECRET ??= "test-secret";
