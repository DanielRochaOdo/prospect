-- Prospect Odontoart, schema inicial idempotente (PostgreSQL 15+)
-- statement
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- statement
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 email text NOT NULL UNIQUE,
 password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'operator' CHECK (role IN ('admin','operator')),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE TABLE IF NOT EXISTS sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id,expires_at);
-- statement
CREATE TABLE IF NOT EXISTS login_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 email text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 success boolean NOT NULL DEFAULT false
);
-- statement
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts(email,created_at DESC);
-- statement
CREATE TABLE IF NOT EXISTS api_limits (
 provider text NOT NULL,
 operation text NOT NULL,
 monthly_limit integer CHECK(monthly_limit IS NULL OR monthly_limit>=0),
 minute_limit integer NOT NULL CHECK(minute_limit>=0),
 enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,operation)
);
-- statement
ALTER TABLE api_limits ALTER COLUMN monthly_limit DROP NOT NULL;
-- statement
INSERT INTO api_limits(provider,operation,monthly_limit,minute_limit) VALUES
 ('cnpjai','basic',NULL,60),('cnpjai','branches',NULL,60),
 ('localiza','search',2000,40),('google','text_pro',5000,20)
ON CONFLICT DO NOTHING;
-- statement
INSERT INTO api_limits(provider,operation,monthly_limit,minute_limit) VALUES
 ('google','text_enterprise',1000,10)
ON CONFLICT DO NOTHING;
-- statement
CREATE TABLE IF NOT EXISTS api_usage (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 provider text NOT NULL,
 operation text NOT NULL,
 period_month text NOT NULL,
 period_minute text NOT NULL,
 state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','success','error','not_found','rate_limited')),
 http_status integer,
 duration_ms integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
-- statement
CREATE INDEX IF NOT EXISTS api_usage_count_idx ON api_usage(provider,operation,period_month);
-- statement
CREATE INDEX IF NOT EXISTS api_usage_minute_idx ON api_usage(provider,period_minute);
-- statement
CREATE TABLE IF NOT EXISTS search_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 provider text NOT NULL,
 filters jsonb NOT NULL DEFAULT '{}'::jsonb,
 results_count integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS search_history_user_idx ON search_history(user_id,created_at DESC);
-- statement
CREATE TABLE IF NOT EXISTS companies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cnpj_root text NOT NULL UNIQUE,
 legal_name text NOT NULL,
 legal_nature text,
 source text NOT NULL CHECK(source IN ('cnpjai','localiza','manual')),
 synced_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE TABLE IF NOT EXISTS establishments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 cnpj text NOT NULL UNIQUE,
 trade_name text,
 is_headquarters boolean,
 status text,
 cnae text,
 segment text,
 city text,
 state text,
 district text,
 address text,
 postal_code text,
 phone text,
 email text,
 source text NOT NULL CHECK(source IN ('cnpjai','localiza','manual')),
 synced_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS establishments_company_idx ON establishments(company_id);
-- statement
CREATE TABLE IF NOT EXISTS leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 establishment_id uuid NOT NULL REFERENCES establishments(id) ON DELETE RESTRICT,
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'novo' CHECK(status IN ('novo','prospeccao','contatado','negociacao','convertido','descartado')),
 notes text NOT NULL DEFAULT '',
 next_contact_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(establishment_id,owner_id)
);
-- statement
CREATE INDEX IF NOT EXISTS leads_owner_idx ON leads(owner_id,updated_at DESC);
-- statement
CREATE TABLE IF NOT EXISTS lead_interactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 channel text NOT NULL CHECK(channel IN ('telefone','email','whatsapp','reuniao','outro')),
 description text NOT NULL,
 happened_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS interactions_lead_idx ON lead_interactions(lead_id,happened_at DESC);
-- statement
CREATE TABLE IF NOT EXISTS audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 action text NOT NULL,
 subject_type text NOT NULL,
 subject_id text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
-- statement
CREATE TABLE IF NOT EXISTS segments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL UNIQUE,
 search_term text NOT NULL,
 cnae text,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
-- Remova somente os cinco registros originais ainda intactos.
-- Os segmentos cujo nome, termo, CNAE ou status foram personalizados permanecem preservados.
-- statement
DELETE FROM segments
 WHERE active = true
   AND (name,search_term,coalesce(cnae,'')) IN (
     ('Clínicas odontológicas','atividade odontológica','8630504'),
     ('Consultórios odontológicos','atividade odontológica','8630504'),
     ('Laboratórios de prótese','serviços de prótese dentária','3250706'),
     ('Materiais odontológicos','materiais odontológicos',''),
     ('Distribuidores odontológicos','distribuição de materiais odontológicos','')
   );
-- statement
-- Segmentos comerciais amplos para prospecção de benefícios corporativos.
-- CNAE é NULL porque cada setor engloba diversas classes de atividades.
INSERT INTO segments(name,search_term,cnae) VALUES
 ('Educação','educação',NULL),
 ('Indústria','indústria',NULL),
 ('Comércio varejista','comércio varejista',NULL),
 ('Comércio atacadista','comércio atacadista',NULL),
 ('Construção civil','construção civil',NULL),
 ('Transporte e logística','transporte e logística',NULL),
 ('Tecnologia e informática','tecnologia da informação',NULL),
 ('Serviços administrativos','serviços administrativos',NULL),
 ('Hotelaria e turismo','hotelaria e turismo',NULL),
 ('Alimentação','alimentação',NULL)
ON CONFLICT (name) DO NOTHING;

-- Quatro provedores complementares de gestores, com cotas idempotentes.
-- Preserva limites personalizados configurados pelo administrador.
-- statement
INSERT INTO api_limits(provider,operation,monthly_limit,minute_limit) VALUES
 ('opencnpj','qsa',3000,120),
 ('exa','people_search',400,5),
 ('apollo','people_search',300,5),
 ('hunter','domain_finder',300,10),
 ('hunter','domain_search',40,5)
ON CONFLICT DO NOTHING;

-- Atualização idempotente dos limites inicialmente fornecidos no app.
-- Não sobrescrever edições administrativas registradas na auditoria.
-- statement
UPDATE api_limits l SET monthly_limit=NULL, minute_limit=60, updated_at=now()
 WHERE l.provider='cnpjai' AND l.operation IN ('basic','branches')
   AND l.monthly_limit=1000 AND l.minute_limit=40
   AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.subject_type='api_limits' AND a.subject_id=l.provider||':'||l.operation AND a.action='update');
-- statement
UPDATE api_limits l SET monthly_limit=2000, minute_limit=40, updated_at=now()
 WHERE l.provider='localiza' AND l.operation='search'
   AND l.monthly_limit=1500 AND l.minute_limit=30
   AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.subject_type='api_limits' AND a.subject_id=l.provider||':'||l.operation AND a.action='update');
-- statement
UPDATE api_limits l SET monthly_limit=5000, minute_limit=20, updated_at=now()
 WHERE l.provider='google' AND l.operation='text_pro'
   AND l.monthly_limit=1000 AND l.minute_limit=20
   AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.subject_type='api_limits' AND a.subject_id=l.provider||':'||l.operation AND a.action='update');
