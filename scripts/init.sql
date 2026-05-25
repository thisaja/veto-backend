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
    SessionID uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    UserID uuid REFERENCES Users(UserID) ON DELETE CASCADE
);

CREATE TABLE Dealbreakers (
    DealbreakerID SERIAL PRIMARY KEY,
    DealbreakerName varchar(255) NOT NULL
);

-- Creating Users
INSERT INTO Users (FirstName, LastName, Email, Password, DiningAlias, ProfilePicture, Dealbreakers)
VALUES 
('Samuel', 'Wang Rong', 'samwanron@gmail.com', 'coolguy123', 'coolguy123', NULL, '[0,2]');

-- Creating Session
INSERT INTO Sessions (UserID)
VALUES 
(
  (
  SELECT UserID FROM Users
  WHERE Email='samwanrong@gmail.com'
  LIMIT 1
  )
);

-- Creating Dealbreakers
INSERT INTO Dealbreakers (DealbreakerName)
VALUES 
('Vegan'),
('Vegetarian'),
('Gluten-Free'),
('Halal'),
('Nut Allergy'),
('Kosher');