import migrateTestDatabase from "../test/global-setup";

export default function globalSetup() {
  migrateTestDatabase();
}
