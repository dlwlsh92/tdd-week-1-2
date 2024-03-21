import {Injectable} from "@nestjs/common";
import {UserPointTable} from "../database/userpoint.table";
import {PointHistoryTable} from "../database/pointhistory.table";
import { Mutex } from 'async-mutex';
import {sortHistoryByTime} from "./point.model";


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

    getUserPoint(userId: number) {
        return this.userDb.selectById(userId)
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
        if (transactionType === 1 && currentUserPoint.point < amount) throw new Error("포인트가 부족합니다.")
        const updatedPoint = transactionType === 0 ? currentUserPoint.point + amount : currentUserPoint.point - amount
        const updatedUserPoint = await this.userDb.insertOrUpdate(userId, updatedPoint)
        await this.insertPointHistory(userId, amount, transactionType)
        return updatedUserPoint
    }

    insertPointHistory(userId: number, amount: number, transactionType: number) {
        return this.historyDb.insert(userId, amount, transactionType, Date.now())
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