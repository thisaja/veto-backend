import { Request, Response } from "express";
import db from "../config/db";

const getQuestionsAndAnswers = async (req: Request, res: Response) => {
  try {
    const query = "SELECT id, Question, Answer FROM QuestionAnswer ORDER BY id ASC";
    const result = await db.query(query);

    // Transform data to match frontend expectations
    const formattedData = result.rows.map((row: any) => ({
      id: row.id,
      question: row.Question,
      answer: row.Answer
    }));

    res.status(200).json({
      success: true,
      data: formattedData
    });
  } 
  catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Error retrieving questions and answers" 
    });
    console.error("Error retrieving questions:", error);
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