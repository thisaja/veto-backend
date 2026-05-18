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