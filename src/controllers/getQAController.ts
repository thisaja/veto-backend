import { Request, Response } from "express";
import db from "../config/db";

const getQuestionsAndAnswers = async (req: Request, res: Response) => {
  try {
    // If a sessionId is provided, return only questions for that session.
    // Falls back to all questions when no sessionId is given (e.g. during development).
    const sessionId = req.query.sessionId ? (req.query.sessionId as string) : null;

    const query = sessionId
      ? "SELECT * FROM QuestionAnswer WHERE session_id = $1 ORDER BY id ASC"
      : "SELECT * FROM QuestionAnswer ORDER BY id ASC";
    const result = sessionId ? await db.query(query, [sessionId]) : await db.query(query);
    console.log(`Retrieved ${result.rows.length} questions from database`);
    console.log(`Result object keys:`, Object.keys(result));
    console.log(`Result rows type:`, typeof result.rows);
    console.log(`Result rows isArray:`, Array.isArray(result.rows));
    console.log(`Result rows:`, result.rows);
    
    // Debug: Check raw Answer column values
    if (result.rows && result.rows.length > 0) {
      const sampleRow = result.rows[0];
      console.log(`Sample row keys:`, Object.keys(sampleRow));
      // Handle both PascalCase and lowercase column names
      console.log(`Sample row Answer value:`, sampleRow.Answer ?? sampleRow.answer);
      console.log(`Sample row Answer type:`, typeof (sampleRow.Answer ?? sampleRow.answer));
      console.log(`Sample row Answer isArray:`, Array.isArray(sampleRow.Answer ?? sampleRow.answer));
      console.log(`Sample row Question:`, sampleRow.Question ?? sampleRow.question);
    }

    // PostgreSQL TEXT[] arrays come back as actual arrays in Node.js/pg library
    // Column names may be PascalCase or lowercase depending on how the table was created.
    // We handle both to be safe.
    const formattedData = result.rows.map((row: any) => {
      let answer: string[] = [];

      // Support both "Answer" (quoted identifier) and "answer" (unquoted/lowercase)
      const rawAnswer = row.Answer ?? row.answer;
      const rawQuestion = row.Question ?? row.question;

      if (rawAnswer != null && rawAnswer !== undefined) {
        if (Array.isArray(rawAnswer)) {
          // It's a proper array
          answer = rawAnswer.map((a: any) => {
            if (typeof a === 'string') {
              return a.trim();
            } else if (a !== null && a !== undefined) {
              return a.toString().trim();
            }
            return '';
          }).filter((a: any) => a !== '');
        } else {
          // It might be a string representation of an array
          const strAnswer = String(rawAnswer);
          // Try to parse as JSON array
          try {
            const parsed = JSON.parse(strAnswer);
            if (Array.isArray(parsed)) {
              answer = parsed.map((a: any) => typeof a === 'string' ? a.trim() : String(a).trim());
            }
          } catch (e) {
            // Not JSON, try comma-separated parsing
            answer = strAnswer.split(',').map((a: any) => a.trim()).filter(a => a !== '');
          }
        }
      }

      return {
        id: row.id,
        question: rawQuestion,
        answer: answer
      };
    });

    console.log(`Formatted data:`, formattedData);

    res.status(200).json({
      success: true,
      data: formattedData
    });
  } 
  catch (error) {
    console.error("Error retrieving questions:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving questions and answers",
      error: String(error)
    });
  }
};

const submitAnswer = async (req: Request, res: Response) => {
  try {
    const { userId, answers } = req.body;
    
    if (!userId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        message: "Missing userId or answers"
      });
    }

    const insertQuery = `INSERT INTO UserAnswers (UserID, QuestionID, Answer) VALUES ($1, $2, $3)`;
    
    for (const answer of answers) {
      const values = [userId, answer.id, answer.value];
      await db.query(insertQuery, values);
    }

    return res.status(201).json({
      success: true,
      message: "Answers submitted successfully"
    });
  } 
  catch (error) {
    console.error("Error submitting answers:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Error submitting answers" 
    });
  }
};

export { getQuestionsAndAnswers, submitAnswer };