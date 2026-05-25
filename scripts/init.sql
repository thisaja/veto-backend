DROP TABLE IF EXISTS Sessions, Dealbreakers, QuestionAnswer, Restaurants, Users CASCADE;
CREATE TABLE Users (
  UserID uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  FirstName varchar(255) NOT NULL,   
  LastName varchar(255) NOT NULL,
  Email varchar(255) NOT NULL UNIQUE,
  Password varchar(255) NOT NULL,
  DiningAlias varchar(255) NOT NULL,
  ProfilePicture varchar(255),
  Dealbreakers varchar(255)
);

CREATE TABLE Sessions (
    session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    UserID uuid REFERENCES Users(UserID) ON DELETE CASCADE
);

CREATE TABLE Dealbreakers (
    dealbreaker_id SERIAL PRIMARY KEY,
    dealbreaker_name varchar(255) NOT NULL
);

CREATE TABLE QuestionAnswer (
  id INT NOT NULL,
  Question varchar(255) NOT NULL,
  Answer TEXT[]
);

CREATE TABLE UserAnswers (
  id SERIAL PRIMARY KEY,
  UserID uuid REFERENCES Users(UserID) ON DELETE CASCADE,
  QuestionID INT NOT NULL,
  Answer TEXT NOT NULL
);

CREATE TABLE Restaurants (
  id INT NOT NULL,
  header varchar(255) NOT NULL,
  imageURL varchar(1000) NOT NULL,
  label varchar(255) NOT NULL,
  caption varchar(255) NOT NULL
);

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
-- (0, 'How much are we balling out?', ARRAY['$', '$$', '$$$']),

-- Creating Restaurants
INSERT INTO Restaurants (id, header, imageURL, label, caption)
VALUES
(0, 'Osteria Bianca', 'https://lh3.googleusercontent.com/aida-public/AB6AXuBHnkYKOAbep7frBylAtCBiv3d_UfuMpT8I3PdX_C65LLgCJ_QUqyG9JsMLTmIcispI4rbXnIS4hDzamuFtTdXEloFfGxI1mIbsoXfOVJKNBTVd7qEn7jit9yq_X8EOp2wlAAyIy7YZ46eKuXpnAHQUM8zmh09F1xjcUrl-8KDhnibdU-YDA7ddmiCXKjWubxQ5fZ0x_4hkNqqTFcxAUc6NfF53Q3qxk-yUJmQrCmalct501KheeHwNZqo0Krc-ryISjiMeBuulyrwZ', 'Italian', 'Handmade pasta and rare regional wines in an intimate, candlelit setting that feels miles away from the city noise.');