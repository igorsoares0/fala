import migrateTestDatabase from "../../../test/migrate-test-db";

export default function globalSetup() {
  migrateTestDatabase();
}
