import {Injectable} from "@nestjs/common";
import {UserPointTable} from "../database/userpoint.table";
import {PointHistoryTable} from "../database/pointhistory.table";
import { Mutex } from 'async-mutex';
import {sortHistoryByTime, TransactionType} from "./point.model";


@Injectable()
export class PointService {
    private userMutexes: Map<number, Mutex> = new Map();
    constructor(
        private readonly userDb: UserPointTable,
        private readonly historyDb: PointHistoryTable,
    ){}

    private getMutexForUser(userId: number) {
        this.isValidId(userId);
        let mutex = this.userMutexes.get(userId);
        if (!mutex) {
            mutex = new Mutex();
            this.userMutexes.set(userId, mutex);
        }
        return mutex;
    }

    async getUserPoint(userId: number) {
        this.isValidId(userId);
        try {
            const userPoint = await this.userDb.selectById(userId)
            return userPoint
        } catch (e) {
            throw new Error("포인트 조회에 실패하였습니다.")
        }
    }

    async withUserLock(userId: number, fn: () => Promise<any>) {
        const mutex = this.getMutexForUser(userId);
        const release = await mutex.acquire();
        try {
            return await fn();
        } finally {
            release();
        }
    }

    async usePoint(userId: number, amount: number) {
        return this.withUserLock(userId, () => this.updateUserPoint(userId, amount, 1))
    }

    async chargePoint(userId: number, amount: number) {
        return this.withUserLock(userId, () => this.updateUserPoint(userId, amount, 0))
    }

    async updateUserPoint(userId: number, amount: number, transactionType: number) {
        this.isValidId(userId)
        this.isValidAmount(amount)
        const currentUserPoint = await this.getUserPoint(userId);
        const calculatedPoint = this.calculatePoint(currentUserPoint.point, amount, transactionType)
        const updatedUserPoint = await this.updateUserPointTable(userId, calculatedPoint)
        await this.insertPointHistory(userId, amount, transactionType)
        return updatedUserPoint
    }

    calculatePoint(currentPoint: number, amount: number, transactionType: TransactionType) {
        const calculatedPoint = transactionType === 0 ? currentPoint + amount : currentPoint - amount
        if (calculatedPoint < 0) throw new Error("포인트가 부족합니다.")
        return calculatedPoint
    }

    async updateUserPointTable(userId: number, updatedPoint: number) {
        try {
            const updatedUserPoint = await this.userDb.insertOrUpdate(userId, updatedPoint)
            return updatedUserPoint
        } catch (e) {
            throw new Error("포인트 업데이트에 실패하였습니다.")
        }
    }


    async insertPointHistory(userId: number, amount: number, transactionType: number) {
        try {
            const pointHistory = await this.historyDb.insert(userId, amount, transactionType, Date.now())
            return pointHistory
        } catch (e) {
            throw new Error("포인트 내역 추가에 실패하였습니다.")
        }
    }

    async getUserPointHistory(userId: number) {
        this.isValidId(userId);
        const userPointHistory = await this.historyDb.selectAllByUserId(userId)
        userPointHistory.sort(sortHistoryByTime);
        return userPointHistory;
    }

    isValidId(id: number) {
        if (Number.isInteger(id) && id > 0) return
        throw new Error("올바르지 않은 ID 값 입니다.")
    }

    isValidAmount(amount: number) {
        if (Number.isInteger(amount) && amount > 0) return
        throw new Error("올바르지 않은 포인트 값 입니다.")
    }

}