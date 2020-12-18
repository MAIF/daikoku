DROP TABLE IF EXISTS daikoku.apis;
DROP TABLE IF EXISTS daikoku.teams;
DROP TABLE IF EXISTS daikoku.tenants;
DROP TABLE IF EXISTS daikoku.users;
DROP TABLE IF EXISTS daikoku.password_reset;
DROP TABLE IF EXISTS daikoku.api_documentation_pages;
DROP TABLE IF EXISTS daikoku.api_subscriptions;
DROP TABLE IF EXISTS daikoku.audit_events;
DROP TABLE IF EXISTS daikoku.account_creation;
DROP TABLE IF EXISTS daikoku.consumptions;
DROP TABLE IF EXISTS daikoku.messages;
DROP TABLE IF EXISTS daikoku.notifications;
DROP TABLE IF EXISTS daikoku.translations;
DROP TABLE IF EXISTS daikoku.user_sessions;

CREATE TABLE daikoku."tenants" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);
CREATE TABLE daikoku."password_reset" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);
CREATE TABLE daikoku."account_creation" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);
CREATE TABLE daikoku."teams" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);
CREATE TABLE daikoku."apis" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);
CREATE TABLE daikoku."translations" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);
CREATE TABLE daikoku."messages" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);
CREATE TABLE daikoku."api_subscriptions" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);
CREATE TABLE daikoku."api_documentation_pages" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);
CREATE TABLE daikoku."notifications" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);
CREATE TABLE daikoku."consumptions" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);
CREATE TABLE daikoku."audit_events" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);
CREATE TABLE daikoku."users" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);
CREATE TABLE daikoku."user_sessions" (
	_id character varying PRIMARY KEY,
	_deleted BOOLEAN,
	content JSONB
);