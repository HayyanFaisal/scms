-- Alter banking_details table to add missing columns
-- This extends the table to support the full banking form

ALTER TABLE banking_details
ADD COLUMN Bank_Name VARCHAR(100) AFTER P_No_O_No,
ADD COLUMN Account_Number VARCHAR(50) AFTER Account_Title,
ADD COLUMN Branch_Code VARCHAR(20) AFTER Account_Number,
ADD COLUMN Branch_Address VARCHAR(255) AFTER Branch_Code,
ADD COLUMN Routing_Number VARCHAR(20) AFTER IBAN;

-- Update existing records with parsed data from Bank_Name_Branch
-- This splits the combined field into separate components where possible
UPDATE banking_details 
SET 
    Bank_Name = CASE 
        WHEN Bank_Name_Branch LIKE '%Standard Chartered%' THEN 'Standard Chartered Bank'
        WHEN Bank_Name_Branch LIKE '%HBL%' THEN 'Habib Bank Limited'
        WHEN Bank_Name_Branch LIKE '%UBL%' THEN 'United Bank Limited'
        ELSE Bank_Name_Branch
    END,
    Branch_Address = CASE 
        WHEN Bank_Name_Branch LIKE '%,%' THEN SUBSTRING_INDEX(Bank_Name_Branch, ',', -1)
        ELSE Bank_Name_Branch
    END
WHERE Bank_Name IS NULL;
