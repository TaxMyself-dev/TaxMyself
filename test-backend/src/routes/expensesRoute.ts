import { datasource } from '../datasource';
import { Expense } from '../entity/Expense';
import { User } from '../entity/User';
import express, { Response } from 'express';
import { expressjwt, Request as JWTRequest } from "express-jwt";
const router = express.Router();

router.post(
  "/", expressjwt({ secret: "32r9oisdfaO(IJNWEHNasdfkas lkjasjhfe89ou:LKJD", algorithms: ["HS256"] }),
  async function (req: JWTRequest, res: express.Response) {
    try {
      const userId: number = req.auth?.id
      if (!userId)
        res.status(500).send('Could not add expense')

      const user = await datasource.getRepository(User).findOne({
        where: {
          id: userId,
        }
      });

      if (!user) {
        res.status(500).send('Could not add expense');
      } else {

        const newExpense = { ...req.body, user:userId }
        console.log(newExpense)

        const expense = datasource.getRepository(Expense).create(newExpense)
        const results = await datasource.getRepository(Expense).save(expense)
        return res.send(results)
      }
    } catch (err) {
      console.log(err)
      res.status(500).send('Could not add expense');
    }
  }
);

export default router;