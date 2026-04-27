# SCMS

This project now runs with a React frontend and a local Express/MySQL backend.

## Run


## MySQL Setup (Windows)

1. **Install MySQL:**
	- Download MySQL Community Server from https://dev.mysql.com/downloads/mysql/ and install it.
	- During installation, set your root password (e.g., `Hayyan`).

2. **Start MySQL Server:**
	- MySQL usually runs as a Windows service. To check, press `Win + R`, type `services.msc`, and ensure `MySQL` or `MySQL80` is running.

3. **Create the Database:**
	- Use either the command line or MySQL Workbench (UI):
	  - **Command Line:**
		 - Open Command Prompt and run: `mysql -u root -p` and enter your password.
		 - Then run:
			```sql
			CREATE DATABASE pnba;
			USE pnba;
			```
	  - **Workbench (UI):**
		 - Download from https://dev.mysql.com/downloads/workbench/ and connect to your server with your password.
		 - Create a new schema named `pnba`.

4. **Run the Schema:**
  ```sh
  -- Core Identity
CREATE TABLE Parent_Beneficiary (
    P_No_O_No VARCHAR(50) PRIMARY KEY,
    Parent_Name VARCHAR(100) NOT NULL,
    Rank_Rate VARCHAR(50),
    Unit VARCHAR(100),
    Admin_Authority VARCHAR(100),
    Service_Status ENUM('Serving', 'Retired', 'Expired'),
    Parent_CNIC VARCHAR(20)
);

-- Documentation Tracking
CREATE TABLE Document_Tracking (
    Doc_ID INT PRIMARY KEY AUTO_INCREMENT,
    P_No_O_No VARCHAR(50),
    Letter_Reference VARCHAR(255),
    Contact_No VARCHAR(50),
    Almirah_No VARCHAR(20),
    File_No VARCHAR(20),
    FOREIGN KEY (P_No_O_No) REFERENCES Parent_Beneficiary(P_No_O_No)
);

-- Banking Layer
CREATE TABLE Banking_Details (
    Account_ID INT PRIMARY KEY AUTO_INCREMENT,
    P_No_O_No VARCHAR(50),
    Account_Title VARCHAR(100),
    IBAN VARCHAR(50) UNIQUE,
    Bank_Name_Branch VARCHAR(255),
    FOREIGN KEY (P_No_O_No) REFERENCES Parent_Beneficiary(P_No_O_No)
);

-- Child Medical Profile
CREATE TABLE Dependent_Children (
    Child_ID INT PRIMARY KEY AUTO_INCREMENT,
    P_No_O_No VARCHAR(50),
    Child_Name VARCHAR(100),
    Age DECIMAL(4,1),
    CNIC_BForm_No VARCHAR(20) UNIQUE,
    Disease_Disability TEXT,
    Disability_Category CHAR(1), -- A, B, C
    School VARCHAR(100),
    FOREIGN KEY (P_No_O_No) REFERENCES Parent_Beneficiary(P_No_O_No)
);

-- Financials & Gadgets
CREATE TABLE Monthly_Grants (
    Grant_ID INT PRIMARY KEY AUTO_INCREMENT,
    Child_ID INT,
    Monthly_Amount DECIMAL(10,2),
    Total_CFY_Amount DECIMAL(10,2),
    Approved_From DATE,
    Approved_To DATE,
    FOREIGN KEY (Child_ID) REFERENCES Dependent_Children(Child_ID)
);

CREATE TABLE Child_Gadgets (
    Gadget_ID INT PRIMARY KEY AUTO_INCREMENT,
    Child_ID INT,
    Detail_of_Gadgets VARCHAR(255),
    Base_Cost DECIMAL(10,2),
    Tax_18_Percent DECIMAL(10,2) AS (Base_Cost * 0.18),
    Total_Cost DECIMAL(10,2) AS (Base_Cost * 1.18),
    Acquisition_Type ENUM('Off the Shelf', 'Customized', 'Reimbursed'),
    FOREIGN KEY (Child_ID) REFERENCES Dependent_Children(Child_ID)
);
  ```

5. **Configure the App:**
	- Update the `.env` file with your MySQL password:
	  ```
	  DATABASE_URL=mysql://root:Hayyan@127.0.0.1:3306/pnba
	  ```

6. **Install Dependencies:**
	- In the `scms` folder, run:
	  ```sh
	  npm install
	  ```

7. **Run the App:**
	- Start everything with:
  Go to scms
	  ```sh
	  npm run dev
	  ```

  Go to scms\parent-portal
	  ```sh
	  npm start
	  ```  

  Go to scms\parent-portal\client
	  ```sh
	  npm run dev
	  ```   

The launcher starts the API on [http://localhost:3001](http://localhost:3001) and the Vite app on [http://localhost:5173](http://localhost:5173).

## Data

The backend auto-migrates the existing tables to the fields the app expects, then the frontend hydrates its cache from the API.
Use the dashboard's sample-data button if you want to repopulate the SQL tables.
