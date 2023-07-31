import { datasource } from '../datasource';
import express, { Response } from 'express';
import { User } from '../entity/User';
import { expressjwt, Request as JWTRequest } from "express-jwt";

const router = express.Router();

router.get(
  "/userdata", expressjwt({ secret: "32r9oisdfaO(IJNWEHNasdfkas lkjasjhfe89ou:LKJD", algorithms: ["HS256"] }),
  async function (req: JWTRequest, res: express.Response) {
    const userId: number = req.auth?.id
    if(!userId)
      res.status(500).send('Could not find user')

    const user = await datasource.getRepository(User).findOne({
      where: {
        id: userId,
      },
      relations: ["expenses", "incomes"] // Include expenses and incomes in the response
    });
  
    if (!user) {
      res.status(500).send('Could not find user');
    } else {
      res.status(200).json({
        firstName: user.firstName,
        lastName: user.lastName,
        expenses: user.expenses,
        incomes: user.incomes
      })
    }
  }
);

export default router;