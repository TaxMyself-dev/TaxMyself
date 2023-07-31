import { datasource } from '../datasource';
import { Income } from '../entity/Income';
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
        res.status(500).send('Could not add income');
      } else {

        const newIncome = { ...req.body, user:userId }
        console.log(newIncome)

        const income = datasource.getRepository(Income).create(newIncome)
        const results = await datasource.getRepository(Income).save(income)
        return res.send(results)
      }
    } catch (err) {
      console.log(err)
      res.status(500).send('Could not add expense');
    }
  }
);

export default router;