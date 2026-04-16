-- ============================================================
-- JKOS FINANCIAL MAINFRAME — Database Schema v2.6
-- PostgreSQL 14+
-- Run: psql $DATABASE_URL -f schema.sql
-- Or:  Paste into Supabase SQL Editor → Run
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. CATEGORIES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    code        VARCHAR(30)  PRIMARY KEY,
    name_th     VARCHAR(100) NOT NULL,
    name_en     VARCHAR(100) NOT NULL,
    type        VARCHAR(10)  NOT NULL CHECK (type IN ('Income','Expenses','Savings')),
    icon        VARCHAR(10),
    color       VARCHAR(20),
    parent_code VARCHAR(30)  REFERENCES categories(code),
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── 2. ACCOUNTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
    id          SERIAL       PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    type        VARCHAR(30),                        -- Cash, Bank, Credit, Investment
    bank        VARCHAR(60),
    balance     NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency    VARCHAR(5)   NOT NULL DEFAULT 'THB',
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── 3. TRANSACTIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id              SERIAL        PRIMARY KEY,
    date            DATE          NOT NULL,
    type            VARCHAR(10)   NOT NULL CHECK (type IN ('Income','Expenses','Savings')),
    category_code   VARCHAR(30)   REFERENCES categories(code),
    description     TEXT          NOT NULL DEFAULT '',
    amount          NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
    payment_method  VARCHAR(30)   NOT NULL DEFAULT 'Cash',
    status          VARCHAR(20)   NOT NULL DEFAULT 'Paid',
    account_id      INTEGER       REFERENCES accounts(id),
    is_recurring    BOOLEAN       NOT NULL DEFAULT FALSE,
    recurring_day   INTEGER       CHECK (recurring_day BETWEEN 1 AND 31),
    tags            TEXT[],
    notes           TEXT,
    priority        VARCHAR(10)   NOT NULL DEFAULT 'Medium'
                                  CHECK (priority IN ('Low','Medium','High')),
    source          VARCHAR(30)   NOT NULL DEFAULT 'webapp',
    external_id     VARCHAR(200)  UNIQUE,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- Partial unique index for sheets_sync dedup (used in googleSheets.js)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_sheets
    ON transactions (external_id)
    WHERE source = 'sheets_sync';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_transactions_date         ON transactions (date)          WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_type         ON transactions (type)          WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_category     ON transactions (category_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_date_type    ON transactions (date, type)    WHERE deleted_at IS NULL;

-- ─── 4. GOALS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
    id              SERIAL        PRIMARY KEY,
    name            VARCHAR(100)  NOT NULL,
    target_amount   NUMERIC(15,2) NOT NULL CHECK (target_amount > 0),
    current_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
    deadline        DATE,
    icon            VARCHAR(10),
    color           VARCHAR(20),
    is_completed    BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ─── 5. SHEETS SYNC LOG ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS sheets_sync_log (
    id              SERIAL       PRIMARY KEY,
    sheet_id        VARCHAR(200) NOT NULL,
    sync_type       VARCHAR(10)  NOT NULL CHECK (sync_type IN ('pull','push')),
    status          VARCHAR(10)  NOT NULL DEFAULT 'running'
                                 CHECK (status IN ('running','success','failed')),
    rows_processed  INTEGER      NOT NULL DEFAULT 0,
    rows_inserted   INTEGER      NOT NULL DEFAULT 0,
    rows_updated    INTEGER      NOT NULL DEFAULT 0,
    rows_skipped    INTEGER      NOT NULL DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ  DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

-- ─── 6. SEED: CATEGORIES ─────────────────────────────────────
-- Income categories
INSERT INTO categories (code, name_th, name_en, type, icon, color) VALUES
    ('SALARY',      'เงินเดือน',          'Salary',           'Income',   '💼', '#22C55E'),
    ('BONUS',       'โบนัส',              'Bonus',            'Income',   '🎁', '#10B981'),
    ('BUSINESS',    'รายได้ธุรกิจ',        'Business Revenue',  'Income',   '🏢', '#3B82F6'),
    ('SERVICE_INC', 'รายได้บริการ',        'Service Income',    'Income',   '🛠️', '#6366F1'),
    ('CREDIT_IN',   'เงินคืนเครดิต',       'Credit Return',     'Income',   '💳', '#8B5CF6'),
    ('INVESTMENT',  'รายได้ลงทุน',         'Investment Income', 'Income',   '📈', '#F59E0B'),
    ('OTHER_INC',   'รายได้อื่นๆ',         'Other Income',      'Income',   '💰', '#84CC16')
ON CONFLICT (code) DO NOTHING;

-- Expenses categories
INSERT INTO categories (code, name_th, name_en, type, icon, color) VALUES
    ('FOOD',        'อาหาร & เครื่องดื่ม',  'Food & Beverage',  'Expenses', '🍜', '#EF4444'),
    ('FAMILY',      'ครอบครัว',            'Family',           'Expenses', '👨‍👩‍👧', '#F97316'),
    ('PERSONAL',    'ส่วนตัว',             'Personal',         'Expenses', '👤', '#EC4899'),
    ('TRAVEL',      'การเดินทาง',          'Travel',           'Expenses', '✈️', '#06B6D4'),
    ('INSURANCE',   'ประกันภัย',           'Insurance',        'Expenses', '🛡️', '#64748B'),
    ('TAX_FEE',     'ภาษีและค่าธรรมเนียม', 'Tax & Fees',       'Expenses', '📋', '#6B7280'),
    ('DEBT_PAY',    'ชำระหนี้',            'Debt Payment',     'Expenses', '💳', '#DC2626'),
    ('LENDING',     'ให้ยืม',              'Lending',          'Expenses', '🤝', '#9CA3AF'),
    ('UTILITY',     'ค่าสาธารณูปโภค',      'Utilities',        'Expenses', '💡', '#FBBF24'),
    ('OTHER_EXP',   'ค่าใช้จ่ายอื่นๆ',      'Other Expenses',   'Expenses', '📦', '#94A3B8')
ON CONFLICT (code) DO NOTHING;

-- Savings categories
INSERT INTO categories (code, name_th, name_en, type, icon, color) VALUES
    ('EMERGENCY',   'เงินสำรอง',           'Emergency Fund',   'Savings',  '🛟', '#3B82F6'),
    ('STOCKS',      'หุ้น / กองทุน',        'Stocks & Funds',   'Savings',  '📊', '#8B5CF6'),
    ('GOLD',        'ทอง',                'Gold',             'Savings',  '🥇', '#F59E0B'),
    ('FAMILY_SAVE', 'ออมเพื่อครอบครัว',    'Family Savings',   'Savings',  '🏠', '#22C55E'),
    ('TRAVEL_SAVE', 'ออมเพื่อท่องเที่ยว',  'Travel Savings',   'Savings',  '✈️', '#06B6D4'),
    ('OTHER_SAVE',  'ออมทรัพย์อื่นๆ',      'Other Savings',    'Savings',  '🏦', '#84CC16')
ON CONFLICT (code) DO NOTHING;

-- ─── 7. SEED: DEFAULT ACCOUNT ────────────────────────────────
INSERT INTO accounts (name, type, bank, balance, currency) VALUES
    ('กระเป๋าเงินสด', 'Cash',  NULL,   0, 'THB'),
    ('บัญชีออมทรัพย์', 'Bank', 'KBank', 0, 'THB')
ON CONFLICT DO NOTHING;

-- ─── 8. UPDATED_AT TRIGGER FUNCTION ──────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['transactions','accounts','goals'] LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_updated_at ON %I;
            CREATE TRIGGER trg_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        ', t, t);
    END LOOP;
END $$;

-- ─── DONE ─────────────────────────────────────────────────────
-- Verify: SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
