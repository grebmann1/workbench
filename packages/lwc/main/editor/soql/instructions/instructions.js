export default `
## General Guidelines

1. **Use Proper Formatting**:
   - Each clause ('SELECT', 'FROM', 'WHERE', 'ORDER BY', etc.) should be on a new line for readability.
   - Indent nested queries or subqueries for clarity.

2. **Specify Fields**:
   - Avoid using 'SELECT *'. Always explicitly list the required fields.
   - Ensure field names are accurate and properly capitalized as per the Salesforce schema.

3. **Apply Filters in WHERE Clause**:
   - Use specific filters to limit the dataset retrieved.
   - Use logical operators ('AND', 'OR') and comparison operators ('=', '<', '>', 'LIKE', etc.) correctly.
   - Avoid redundant filters or overly broad conditions.

4. **Leverage Relationships**:
   - Use dot notation for parent-to-child ('ChildRelationshipName__r.FieldName') or child-to-parent ('ParentRelationshipName__r.FieldName') relationships.

5. **Add Limits and Sorting**:
   - Use the 'LIMIT' clause to control the number of records returned.
   - Use 'ORDER BY' to sort records as required.

6. **Avoid Query Performance Issues**:
   - Use selective filters indexed in Salesforce (e.g., 'Id', 'Name', 'CreatedDate') for large datasets.
   - Avoid filtering on non-indexed fields in large objects without careful consideration.

7. **Comment Out Lines**:
   - Start a line with '#' or '--' (as its first non-whitespace characters) to comment it out. The line stays in the editor but is stripped before the query is sent to Salesforce.
   - Only full-line comments are removed — a '#' or '--' that appears after other tokens, or inside a quoted string literal, is left as-is.

---

## Example Queries

### Example 1: Simple Query
**Prompt:** Retrieve account names and their creation dates for all active accounts.  
**SOQL Query:**
'''sql
SELECT Name, CreatedDate
FROM Account
WHERE IsActive = TRUE
ORDER BY CreatedDate DESC
LIMIT 100
'''

---

### Example 2: Query with Relationships
**Prompt:** Retrieve contact names and their related account names for contacts created in the last 30 days.  
**SOQL Query:**
'''sql
SELECT Name, Account.Name
FROM Contact
WHERE CreatedDate = LAST_N_DAYS:30
ORDER BY Account.Name ASC, Name ASC
'''

---

### Example 3: Query with Aggregation
**Prompt:** Count the number of accounts grouped by their industry.  
**SOQL Query:**
'''sql
SELECT Industry, COUNT(Id)
FROM Account
GROUP BY Industry
ORDER BY COUNT(Id) DESC
'''

---

### Example 4: Query with Subquery
**Prompt:** Retrieve account names and the names of their related contacts.  
**SOQL Query:**
'''sql
SELECT Name, (SELECT Name FROM Contacts)
FROM Account
WHERE BillingCountry = 'United States'
ORDER BY Name ASC
LIMIT 50
'''

---

### Example 5: Query with Line Comments
**Prompt:** Retrieve account names while keeping notes in the editor that are not sent to Salesforce.
**SOQL Query:**
'''sql
# this line is ignored
-- so is this one
SELECT Id, Name FROM Account WHERE Name = 'a -- not a comment'
'''

`;
