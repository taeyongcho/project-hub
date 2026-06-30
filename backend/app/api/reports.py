from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.services.report import generate_weekly, generate_monthly, get_report, list_reports, update_report

router = APIRouter(prefix="/reports", tags=["보고서"])


class ReportUpdate(BaseModel):
    content: dict


@router.get("")
async def list_all(type: str | None = Query(None), db: AsyncSession = Depends(get_db),
                   _=Depends(get_current_user)):
    return await list_reports(db, type)


@router.post("/weekly")
async def create_weekly(db: AsyncSession = Depends(get_db), current_user=Depends(require_admin)):
    return await generate_weekly(db, current_user.id)


@router.post("/monthly")
async def create_monthly(db: AsyncSession = Depends(get_db), current_user=Depends(require_admin)):
    return await generate_monthly(db, current_user.id)


@router.get("/{report_id}")
async def get_one(report_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await get_report(db, report_id)


@router.patch("/{report_id}")
async def edit_report(report_id: int, body: ReportUpdate, db: AsyncSession = Depends(get_db),
                      _=Depends(require_admin)):
    return await update_report(db, report_id, body.content)


@router.get("/{report_id}/export/docx")
async def export_docx(report_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from fastapi.responses import StreamingResponse
    from app.services.report import export_to_docx
    buf = await export_to_docx(db, report_id)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                             headers={"Content-Disposition": f"attachment; filename=report_{report_id}.docx"})


@router.get("/{report_id}/export/pdf")
async def export_pdf(report_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from fastapi.responses import StreamingResponse
    from app.services.report import export_to_pdf
    buf = await export_to_pdf(db, report_id)
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename=report_{report_id}.pdf"})
