DROP TABLE IF EXISTS RoundVotes, Rooms, Sessions, Dealbreakers, QuestionAnswer, Restaurants, Users CASCADE;

CREATE TABLE Users (
  UserID uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  FirstName varchar(255) NOT NULL,
  LastName varchar(255) NOT NULL,
  Email varchar(255) NOT NULL UNIQUE,
  Password varchar(255) NOT NULL,
  DiningAlias varchar(50) NOT NULL UNIQUE,   -- serves as the @username handle
  ProfilePicture varchar(255),
  Dealbreakers varchar(255)
);

CREATE TABLE Sessions (
    session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    UserID uuid REFERENCES Users(UserID) ON DELETE CASCADE,
    GuestID uuid,
    Status varchar(20) NOT NULL DEFAULT 'active',
    CreatedAt timestamp NOT NULL DEFAULT NOW(),
    CONSTRAINT user_or_guest CHECK (
        (UserID IS NOT NULL AND GuestID IS NULL) OR
        (UserID IS NULL AND GuestID IS NOT NULL)
    )
);

CREATE TABLE Dealbreakers (
    dealbreaker_id SERIAL PRIMARY KEY,
    dealbreaker_name varchar(255) NOT NULL
);

CREATE TABLE SessionMembers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES Sessions(session_id) ON DELETE CASCADE,
  user_id     uuid REFERENCES Users(UserID) ON DELETE CASCADE,
  guest_id    uuid,
  alias       varchar(100) NOT NULL DEFAULT 'Guest',
  is_host     boolean NOT NULL DEFAULT false,
  has_answered boolean NOT NULL DEFAULT false,
  joined_at   timestamp NOT NULL DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
);

CREATE INDEX idx_session_members_session ON SessionMembers(session_id);

CREATE TABLE QuestionAnswer (
  id         SERIAL PRIMARY KEY,
  session_id uuid REFERENCES Sessions(session_id) ON DELETE SET NULL,
  user_id    uuid REFERENCES Users(UserID) ON DELETE SET NULL,
  guest_id   uuid,
  Question   varchar(255) NOT NULL,
  Answer     TEXT[]
);

CREATE TABLE Restaurants (
  id          SERIAL PRIMARY KEY,
  session_id  uuid REFERENCES Sessions(session_id) ON DELETE CASCADE,
  header      varchar(255)  NOT NULL,
  "imageURL"  varchar(1000) NOT NULL,
  label       varchar(255)  NOT NULL,
  caption     varchar(500)  NOT NULL,
  "imageURLs" text[],
  price_range varchar(20),
  rating      varchar(10),
  popular_items text[],
  address     varchar(500),
  latitude    double precision,
  longitude   double precision,
  phone       varchar(50)
);

-- ── Pick/Ban tables ──────────────────────────────────────────────────────

CREATE TABLE Rooms (
  room_id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid    REFERENCES Sessions(session_id) ON DELETE CASCADE,
  status         varchar(20) NOT NULL DEFAULT 'active',
  current_round  int     NOT NULL DEFAULT 1,
  winner_restaurant_id int,
  created_at     timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE RoundVotes (
  id             SERIAL PRIMARY KEY,
  room_id        uuid    REFERENCES Rooms(room_id) ON DELETE CASCADE,
  round_number   int     NOT NULL,
  restaurant_id  int     NOT NULL,
  vote_count     int     NOT NULL DEFAULT 0,
  voted_at       timestamp NOT NULL DEFAULT NOW()
);

-- ── Friends / social tables ─────────────────────────────────────────────────

CREATE TABLE Friendships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES Users(UserID) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES Users(UserID) ON DELETE CASCADE,
  status       varchar(20) NOT NULL DEFAULT 'pending',
    -- 'pending' | 'accepted' | 'declined'
  created_at   timestamp NOT NULL DEFAULT NOW(),
  updated_at   timestamp NOT NULL DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE INDEX idx_friendships_requester ON Friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON Friendships(addressee_id);
CREATE INDEX idx_friendships_status    ON Friendships(status);

CREATE INDEX idx_sessions_user ON Sessions(UserID);
CREATE INDEX idx_sessions_guest ON Sessions(GuestID);
CREATE INDEX idx_qa_session ON QuestionAnswer(session_id);
CREATE INDEX idx_restaurants_session ON Restaurants(session_id);

-- Creating Users
INSERT INTO Users (FirstName, LastName, Email, Password, DiningAlias, ProfilePicture, Dealbreakers)
VALUES
('GUEST', 'GUEST', 'GUEST', 'GUEST', 'GUEST', 'GUEST', 'GUEST'),
('Samuel', 'Wang Rong', 'samwanron@gmail.com', 'coolguy123', 'coolguy123', NULL, '[0,2]');

-- Creating Session
INSERT INTO Sessions (UserID)
VALUES
(
  (
  SELECT UserID FROM Users
  WHERE Email='GUEST'
  LIMIT 1
  )
);

-- Creating Dealbreakers
INSERT INTO Dealbreakers (dealbreaker_name)
VALUES
('Vegan'),
('Vegetarian'),
('Gluten-Free'),
('Halal'),
('Nut Allergy'),
('Kosher');

-- Creating Question & Answer
-- INSERT INTO QuestionAnswer (id, question, answer)
-- VALUES
-- (1, 'How much are we balling out?', ARRAY['$', '$$', '$$$']);

